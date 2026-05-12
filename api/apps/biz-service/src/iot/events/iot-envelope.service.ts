import { Injectable } from '@nestjs/common';
import { getDefaultLocale } from '../../config/default-locale';

const EVENT_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9_-]+)+$/;
const MAX_REQUEST_ID_LENGTH = 36;

@Injectable()
export class IotEnvelopeService {
  validate<TData extends Record<string, unknown> = Record<string, unknown>>(
    payload: Buffer | string | Record<string, unknown>,
  ): {
    meta: {
      requestId: string;
      deviceId: string;
      timestamp: number;
      event: string;
      version: string;
      locale: string;
    };
    data: TData;
  } {
    let parsed: unknown;
    if (Buffer.isBuffer(payload)) {
      parsed = JSON.parse(payload.toString('utf8'));
    } else if (typeof payload === 'string') {
      parsed = JSON.parse(payload);
    } else {
      parsed = payload;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('IoT payload 必须是对象');
    }
    const record = parsed as Record<string, unknown>;
    const meta = asRecord(record.meta);
    const requestId = pickString(meta.requestId)?.toLowerCase();
    const deviceId = pickString(meta.deviceId)?.toLowerCase();
    const timestamp = Number(meta.timestamp ?? 0);
    const event = pickString(meta.event);
    const version = pickString(meta.version) ?? '1.0';
    const locale = pickString(meta.locale) ?? getDefaultLocale();

    if (!requestId) throw new Error('meta.requestId 不能为空');
    if (!isSupportedRequestId(requestId)) {
      throw new Error('meta.requestId 必须是非空字符串，且长度不能超过 36 位');
    }
    if (!deviceId) throw new Error('meta.deviceId 不能为空');
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('meta.timestamp 不能为空');
    if (!event) throw new Error('meta.event 不能为空');
    if (!EVENT_PATTERN.test(event)) throw new Error(`非法的 IoT event: ${event}`);
    return {
      meta: {
        requestId,
        deviceId,
        timestamp,
        event,
        version,
        locale,
      },
      data: asRecord(record.data) as TData,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isSupportedRequestId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_REQUEST_ID_LENGTH;
}
