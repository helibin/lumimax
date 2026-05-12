import { Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type { DbPingResult } from '@lumimax/database';
import { DbService } from '@lumimax/database';
void DbService;

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  db: DbPingResult;
}

@Injectable()
export class HealthService {
  private readonly dbService: DbService;

  constructor(dbService: DbService) {
    this.dbService = dbService;
  }

  async check(): Promise<HealthCheckResult> {
    const db = await this.dbService.pingCurrentService();
    const status: HealthCheckResult['status'] =
      db.status === 'down'
        ? 'error'
        : db.status === 'not_configured' && db.required
          ? 'degraded'
          : 'ok';

    return {
      status,
      service: getEnvString('SERVICE_NAME')?.trim() || 'unknown-service',
      timestamp: new Date().toISOString(),
      db,
    };
  }
}
