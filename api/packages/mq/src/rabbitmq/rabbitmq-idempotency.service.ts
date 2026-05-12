import { Injectable } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';

const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RabbitMQIdempotencyService {
  private readonly processedEventIds = new Map<string, number>();
  private readonly ttlMs = resolveTtlMs(getEnvString('RABBITMQ_IDEMPOTENCY_TTL_MS'));

  isDuplicate(eventId: string): boolean {
    if (!eventId || eventId.trim().length === 0) {
      return false;
    }

    const key = eventId.trim();
    const now = Date.now();
    const existedAt = this.processedEventIds.get(key);
    if (existedAt && now - existedAt < this.ttlMs) {
      return true;
    }

    this.processedEventIds.set(key, now);
    this.cleanupExpired(now);
    return false;
  }

  private cleanupExpired(now: number): void {
    if (this.processedEventIds.size <= 2048) {
      return;
    }
    for (const [eventId, createdAt] of this.processedEventIds.entries()) {
      if (now - createdAt >= this.ttlMs) {
        this.processedEventIds.delete(eventId);
      }
    }
  }
}

function resolveTtlMs(raw?: string): number {
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_IDEMPOTENCY_TTL_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_IDEMPOTENCY_TTL_MS;
  }
  return Math.floor(parsed);
}
