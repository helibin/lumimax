import { Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';
import type { DatabaseHealthPingResult } from '@lumimax/database';
import { DatabaseHealthService } from '@lumimax/database';
void DatabaseHealthService;

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  db: DatabaseHealthPingResult;
}

@Injectable()
export class HealthService {
  private readonly dbService: DatabaseHealthService;

  constructor(dbService: DatabaseHealthService) {
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
