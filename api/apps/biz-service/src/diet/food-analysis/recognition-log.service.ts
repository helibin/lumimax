import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { RecognitionLogEntity } from '../../common/entities/biz.entities';

@Injectable()
export class RecognitionLogService {
  constructor(
    @InjectRepository(RecognitionLogEntity)
    private readonly recognitionLogRepository: Repository<RecognitionLogEntity>,
  ) {}

  async callAdmin<T>(input: {
    method: string;
    payload?: Record<string, unknown>;
  }): Promise<T> {
    const page = Math.max(1, Number(input.payload?.page ?? 1));
    const pageSize = Math.max(1, Number(input.payload?.pageSize ?? 20));

    switch (input.method) {
      case 'ListRecognitionLogs': {
        const [logs, total] = await this.recognitionLogRepository.findAndCount({
          order: { createdAt: 'DESC' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        return {
          items: logs.map((log) => this.toRecognitionLogAdminItem(log)),
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
            hasMore: page < totalPages,
          },
        } as T;
      }
      case 'GetRecognitionLog': {
        const logId = String(input.payload?.id ?? '').trim();
        const log = await this.mustGetRecognitionLog(logId);
        return {
          id: log.id,
          requestId: log.recognitionRequestId,
          mealRecordId: log.mealId,
          deviceId: log.deviceId,
          imageKey: log.imageKey,
          provider: log.provider,
          status: log.status,
          latencyMs: log.latencyMs,
          requestPayload: log.requestPayloadJson ?? null,
          responsePayload: log.responsePayloadJson ?? null,
          error: log.errorJson ?? null,
          createdAt: log.createdAt.toISOString(),
        } as T;
      }
      default:
        throw new Error(`Unsupported recognition log admin method: ${input.method}`);
    }
  }

  private async mustGetRecognitionLog(logId: string): Promise<RecognitionLogEntity> {
    const log = await this.recognitionLogRepository.findOne({
      where: { id: String(logId).trim() },
    });
    if (!log) {
      throw new Error(`recognition log not found: ${logId}`);
    }
    return log;
  }

  private toRecognitionLogAdminItem(log: RecognitionLogEntity): Record<string, unknown> {
    return {
      id: log.id,
      requestId: log.recognitionRequestId,
      deviceId: log.deviceId,
      mealRecordId: log.mealId,
      imageKey: log.imageKey,
      provider: log.provider,
      status: log.status,
      latencyMs: log.latencyMs,
      createdAt: log.createdAt.toISOString(),
    };
  }
}
