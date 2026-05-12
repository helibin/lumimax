import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { getEnvNumber, getEnvString } from '@lumimax/config';
import { Pool } from 'pg';

export type DbHealthStatus = 'up' | 'down' | 'not_configured';

export interface DbPingResult {
  status: DbHealthStatus;
  required: boolean;
  durationMs?: number;
  database?: string;
  error?: string;
}

interface DbTarget {
  url?: string;
  required: boolean;
}

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  async pingCurrentService(): Promise<DbPingResult> {
    const serviceName = this.resolveServiceName();
    const target = this.resolveDbTarget(serviceName);

    if (!target.url) {
      return { status: 'not_configured', required: target.required };
    }

    const startAt = Date.now();
    const pool = this.getOrCreatePool(target.url);

    try {
      await pool.query('SELECT 1');
      return {
        status: 'up',
        required: target.required,
        durationMs: Date.now() - startAt,
        database: this.resolveDatabaseName(target.url),
      };
    } catch (error) {
      return {
        status: 'down',
        required: target.required,
        durationMs: Date.now() - startAt,
        database: this.resolveDatabaseName(target.url),
        error: this.getErrorMessage(error),
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    const closures = Array.from(this.pools.values()).map((pool) => pool.end());
    await Promise.allSettled(closures);
    this.pools.clear();
  }

  private resolveServiceName(): string {
    return getEnvString('SERVICE_NAME')?.trim() || 'unknown-service';
  }

  private resolveDbTarget(serviceName: string): DbTarget {
    const url = getEnvString('DB_URL')?.trim();
    const normalized = serviceName.toLowerCase();
    const requiredDatabaseServices = [
      'user',
      'notification',
      'device',
      'iot-bridge',
      'nutrition',
      'storage',
      'base-service',
      'biz-service',
    ];

    if (requiredDatabaseServices.some((name) => normalized.includes(name))) {
      return { required: true, url };
    }
    return { required: false, url };
  }

  private getOrCreatePool(connectionString: string): Pool {
    const existed = this.pools.get(connectionString);
    if (existed) {
      return existed;
    }

    const pool = new Pool({
      connectionString,
      max: getEnvNumber('DB_POOL_MAX', 10),
      idleTimeoutMillis: getEnvNumber('DB_IDLE_TIMEOUT_MS', 30000),
      connectionTimeoutMillis: getEnvNumber('DB_CONNECT_TIMEOUT_MS', 3000),
      allowExitOnIdle: true,
    });

    this.pools.set(connectionString, pool);
    return pool;
  }

  private resolveDatabaseName(connectionString: string): string | undefined {
    try {
      const url = new URL(connectionString);
      const pathname = url.pathname.replace(/^\//, '');
      return pathname || undefined;
    } catch {
      return undefined;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
