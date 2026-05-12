import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getEnvString, resolveServiceEnvFilePaths } from '@lumimax/config';
import type { Client } from 'pg';
import { connectPgWithRetry } from './pg-connect-with-retry';

interface MigrationFile {
  id: string;
  fileName: string;
  checksum: string;
  sql: string;
}

interface AppliedMigration {
  id: string;
  checksum: string;
}

const LOCK_KEY = 23810917;
const MIGRATION_ID_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;

export async function applySqlMigrations(serviceName?: string): Promise<void> {
  loadEnvFiles(serviceName);

  const dbUrl = resolveDbUrl();
  const migrationsDir = resolveMigrationsDir();
  const files = readMigrations(migrationsDir);

  if (files.length === 0) {
    return;
  }

  const client = await connectPgWithRetry(dbUrl);

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      for (const migration of files) {
        const existing = applied.get(migration.id);
        if (existing) {
          if (existing.checksum !== migration.checksum) {
            throw new Error(
              `Checksum mismatch for migration ${migration.fileName}. File changed after applied.`,
            );
          }
          continue;
        }

        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query(
            `
            INSERT INTO public.schema_migrations(id, file_name, checksum, executed_at)
            VALUES($1, $2, $3, NOW())
            `,
            [migration.id, migration.fileName, migration.checksum],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }

        process.stdout.write(
          `[database] Applied migration: ${migration.fileName}\n`,
        );
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}

function loadEnvFiles(serviceName?: string): void {
  const envFilePaths = resolveServiceEnvFilePaths(serviceName);
  for (const envFilePath of envFilePaths) {
    process.loadEnvFile(envFilePath);
  }
}

function resolveDbUrl(): string {
  const explicit = getEnvString('DB_MIGRATION_URL') || getEnvString('DB_URL');
  if (explicit?.trim()) {
    return explicit.trim();
  }

  throw new Error('No database URL found. Set DB_MIGRATION_URL or DB_URL.');
}

function resolveMigrationsDir(): string {
  const explicit = getEnvString('DB_MIGRATIONS_DIR');
  if (explicit?.trim()) {
    return resolve(explicit.trim());
  }

  return resolve(process.cwd(), '../../data/db/migrations');
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id VARCHAR(64) PRIMARY KEY,
      file_name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(
  client: Client,
): Promise<Map<string, AppliedMigration>> {
  const { rows } = await client.query<AppliedMigration>(
    `
    SELECT id, checksum
    FROM public.schema_migrations
    ORDER BY id ASC
    `,
  );

  return new Map(rows.map((row: AppliedMigration) => [row.id, row]));
}

function readMigrations(migrationsDir: string): MigrationFile[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }

  const fileNames = readdirSync(migrationsDir)
    .filter((fileName) => MIGRATION_ID_PATTERN.test(fileName))
    .sort((a, b) => a.localeCompare(b));

  return fileNames.map((fileName) => {
    const absolutePath = join(migrationsDir, fileName);
    const sql = readFileSync(absolutePath, 'utf8');
    const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
    const match = fileName.match(MIGRATION_ID_PATTERN);

    if (!match) {
      throw new Error(`Invalid migration file: ${fileName}`);
    }

    return {
      id: match[1],
      fileName,
      checksum,
      sql,
    };
  });
}
