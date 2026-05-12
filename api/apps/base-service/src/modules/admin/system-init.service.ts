import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { DataSource } from 'typeorm';

import { SystemConfigEntity } from '../system/entities/system.entities';
import { PasswordHashService } from './password-hash.service';
import { SystemAdminEntity } from '../system/entities/system.entities';

interface SeedFile {
  id: string;
  fileName: string;
  checksum: string;
  sql: string;
}

interface AppliedSeed {
  id: string;
  checksum: string;
}

const DEFAULT_ADMIN_ID = '01kv7admin0000000000000001';
const INIT_FLAG_KEY = 'system.bootstrap.initialized';
const INIT_AT_KEY = 'system.bootstrap.initialized_at';
const USAGE_MODE_KEY = 'system.bootstrap.usage_mode';
const LOCK_KEY = 23810918;
const SEED_ID_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;
const CORE_SEED_NAME_PATTERNS = [
  /_init_platform_seed\.sql$/,
  /_init_core_seed\.sql$/,
];
const CORE_SEED_TABLES = [
  'system_role_menus',
  'system_admin_roles',
  'system_role_permissions',
  'notification_templates',
  'system_dictionary_items',
  'system_dictionaries',
  'system_configs',
  'system_menus',
  'system_admins',
  'system_roles',
  'system_permissions',
] as const;
const REBUILD_SCOPE = [
  'system_admins',
  'system_admin_roles',
  'system_roles',
  'system_role_permissions',
  'system_permissions',
  'system_menus',
  'system_role_menus',
  'system_dictionaries',
  'system_dictionary_items',
  'system_configs',
  'notification_templates',
] as const;

@Injectable()
export class SystemInitService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PasswordHashService) private readonly passwordHashService: PasswordHashService,
    @InjectRepository(SystemConfigEntity)
    private readonly systemConfigRepository: Repository<SystemConfigEntity>,
  ) {}

  async getStatus(): Promise<Record<string, unknown>> {
    const [initializedConfig, initializedAtConfig, usageModeConfig] = await Promise.all([
      this.systemConfigRepository.findOne({ where: { configKey: INIT_FLAG_KEY } }),
      this.systemConfigRepository.findOne({ where: { configKey: INIT_AT_KEY } }),
      this.systemConfigRepository.findOne({ where: { configKey: USAGE_MODE_KEY } }),
    ]);

    const initialized = initializedConfig?.configValue === 'true';

    return {
      initialized,
      databaseReady: true,
      seedMode: 'baseline-rebuild',
      usageMode: usageModeConfig?.configValue ?? 'default',
      initializedAt: initializedAtConfig?.configValue ?? null,
      warnings: [],
    };
  }

  async initialize(input: {
    username: string;
    password: string;
    nickname: string;
    email?: string;
    usageMode?: string;
  }): Promise<Record<string, unknown>> {
    const username = pickString(input.username);
    const password = pickString(input.password);
    const nickname = pickString(input.nickname);
    const usageMode = pickString(input.usageMode) ?? 'default';
    const email = pickString(input.email) ?? null;

    if (!username || !password || !nickname) {
      throw new BadRequestException('username, password and nickname are required');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.manager.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
      await this.ensureSeedsTable(queryRunner.manager);
      await this.resetCoreSeedState(queryRunner.manager);
      await this.applyPendingSeeds(queryRunner.manager);
      await queryRunner.startTransaction();

      let admin = await queryRunner.manager.findOne(SystemAdminEntity, { where: { id: DEFAULT_ADMIN_ID } });
      if (!admin) {
        admin = await queryRunner.manager.findOne(SystemAdminEntity, {
          where: { username: 'admin' },
          order: { createdAt: 'ASC' },
        });
      }
      if (!admin) {
        throw new ConflictException('seed admin account not found after applying seeds');
      }

      if (admin.username !== username) {
        const existed = await queryRunner.manager.findOne(SystemAdminEntity, { where: { username } });
        if (existed && existed.id !== admin.id) {
          throw new ConflictException('admin username already exists');
        }
      }

      admin.username = username;
      admin.nickname = nickname;
      admin.email = email;
      admin.status = 'active';
      admin.passwordHash = await this.passwordHashService.hashClientPasswordMd5(password, admin.id);
      await queryRunner.manager.save(SystemAdminEntity, admin);

      await this.upsertConfig(queryRunner.manager, INIT_FLAG_KEY, 'true', 'boolean', 'system', '系统初始化完成标记');
      await this.upsertConfig(
        queryRunner.manager,
        INIT_AT_KEY,
        new Date().toISOString(),
        'string',
        'system',
        '系统初始化完成时间',
      );
      await this.upsertConfig(
        queryRunner.manager,
        USAGE_MODE_KEY,
        usageMode,
        'string',
        'system',
        '系统初始化运行模式',
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.manager.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      await queryRunner.release();
    }

    return {
      initialized: true,
      usageMode,
      username,
    };
  }

  private async ensureSeedsTable(manager: EntityManager): Promise<void> {
    await manager.query(`
      CREATE TABLE IF NOT EXISTS public.schema_seeds (
        id VARCHAR(64) PRIMARY KEY,
        file_name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  private async applyPendingSeeds(manager: EntityManager): Promise<void> {
    const files = this.readSeeds();
    const applied = await this.getAppliedSeeds(manager);

    if (files.length === 0) {
      throw new ConflictException('no seed files found');
    }

    for (const seed of files) {
      const existing = applied.get(seed.id);
      if (existing) {
        if (existing.checksum !== seed.checksum) {
          throw new ConflictException(`seed checksum mismatch: ${seed.fileName}`);
        }
        continue;
      }

      await manager.query(seed.sql);
      await manager.query(
        `
        INSERT INTO public.schema_seeds(id, file_name, checksum, executed_at)
        VALUES($1, $2, $3, NOW())
        `,
        [seed.id, seed.fileName, seed.checksum],
      );
    }
  }

  private async resetCoreSeedState(manager: EntityManager): Promise<void> {
    await manager.query(`TRUNCATE TABLE ${CORE_SEED_TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    const coreSeedFiles = this.readSeeds().map((item) => item.fileName);
    if (coreSeedFiles.length === 0) {
      return;
    }

    await manager.query(
      `
      DELETE FROM public.schema_seeds
      WHERE file_name = ANY($1::text[])
      `,
      [coreSeedFiles],
    );
  }

  private async getAppliedSeeds(manager: EntityManager): Promise<Map<string, AppliedSeed>> {
    const rows = await manager.query(
      `
      SELECT id, checksum
      FROM public.schema_seeds
      ORDER BY id ASC
      `,
    );

    return new Map(
      (rows as AppliedSeed[]).map((row) => [row.id, row]),
    );
  }

  private readSeeds(): SeedFile[] {
    const seedsDir = resolve(process.cwd(), '../../data/db/seeds');
    if (!existsSync(seedsDir)) {
      return [];
    }

    const fileNames = readdirSync(seedsDir)
      .filter((fileName) => SEED_ID_PATTERN.test(fileName))
      .filter((fileName) => CORE_SEED_NAME_PATTERNS.some((pattern) => pattern.test(fileName)))
      .sort((a, b) => a.localeCompare(b));

    return fileNames.map((fileName) => {
      const sql = readFileSync(join(seedsDir, fileName), 'utf8');
      const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
      const match = fileName.match(SEED_ID_PATTERN);
      if (!match) {
        throw new ConflictException(`invalid seed file: ${fileName}`);
      }
      return {
        id: match[1],
        fileName,
        checksum,
        sql,
      };
    });
  }

  private async upsertConfig(
    manager: EntityManager,
    configKey: string,
    configValue: string,
    valueType: string,
    groupCode: string,
    name: string,
  ): Promise<void> {
    const existing = await manager.findOne(SystemConfigEntity, { where: { configKey } });
    if (existing) {
      existing.configValue = configValue;
      existing.valueType = valueType;
      existing.groupCode = groupCode;
      existing.name = name;
      existing.status = 'active';
      existing.isEncrypted = false;
      await manager.save(SystemConfigEntity, existing);
      return;
    }

    await manager.save(
      SystemConfigEntity,
      manager.create(SystemConfigEntity, {
        configKey,
        configValue,
        valueType,
        groupCode,
        name,
        description: null,
        isEncrypted: false,
        status: 'active',
      }),
    );
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
