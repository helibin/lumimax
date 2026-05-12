import crypto from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { getEnvString } from '@lumimax/config';

@Injectable()
export class InternalMqttAuthService {
  authorize(headers: Record<string, string | string[] | undefined>): void {
    const expectedToken = pickString(getEnvString('IOT_INTERNAL_SHARED_SECRET'));
    if (!expectedToken) {
      throw new UnauthorizedException('internal mqtt shared secret is not configured');
    }

    const bearerToken = extractBearerToken(headers.authorization);
    const headerToken = firstHeaderValue(headers['x-internal-token']);
    const providedToken = bearerToken ?? headerToken;
    if (!providedToken || !timingSafeMatch(providedToken, expectedToken)) {
      throw new UnauthorizedException('invalid internal mqtt credentials');
    }
  }
}

function extractBearerToken(value: string | string[] | undefined): string | undefined {
  const normalized = firstHeaderValue(value);
  if (!normalized) {
    return undefined;
  }
  const match = normalized.match(/^Bearer\s+(.+)$/i);
  return pickString(match?.[1]);
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return pickString(value[0]);
  }
  return pickString(value);
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function timingSafeMatch(input: string, expected: string): boolean {
  const left = Buffer.from(input, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}
