import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  getEnvString,
  readEnvFirst,
  resolveAliyunCredentials,
  resolveAliyunRegion,
} from '@lumimax/config';

export interface AliyunStsAssumeRoleResult {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: number;
}

@Injectable()
export class AliyunStsService {
  private readonly region = readEnvFirst('STORAGE_REGION') ?? resolveAliyunRegion() ?? '';
  private readonly cloudCredentials = resolveAliyunCredentials();
  private readonly accessKeyId =
    readEnvFirst('STORAGE_ACCESS_KEY_ID') ?? this.cloudCredentials?.accessKeyId ?? '';
  private readonly secretAccessKey =
    readEnvFirst('STORAGE_ACCESS_KEY_SECRET') ?? this.cloudCredentials?.secretAccessKey ?? '';
  private readonly assumeRoleArn = readEnvFirst('STORAGE_STS_ROLE_ARN', 'CLOUD_STS_ROLE_ARN') ?? '';
  private readonly externalId = readEnvFirst('STORAGE_STS_EXTERNAL_ID', 'CLOUD_STS_EXTERNAL_ID')
    ?? undefined;
  private readonly durationSeconds = readEnvNumber(
    ['STORAGE_STS_SESSION_DURATION_SECONDS', 'CLOUD_STS_SESSION_DURATION_SECONDS'],
    900,
  );

  hasAssumeRoleConfig(): boolean {
    return Boolean(this.accessKeyId && this.secretAccessKey && this.assumeRoleArn);
  }

  async assumeRole(requestId: string): Promise<AliyunStsAssumeRoleResult> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error(
        '执行阿里云 STS AssumeRole 需要配置 STORAGE_ACCESS_KEY_ID/STORAGE_ACCESS_KEY_SECRET，或对应的 CLOUD_ACCESS_KEY_ID/CLOUD_ACCESS_KEY_SECRET',
      );
    }
    if (!this.assumeRoleArn) {
      throw new Error(
        '执行阿里云 STS AssumeRole 需要配置 STORAGE_STS_ROLE_ARN 或 CLOUD_STS_ROLE_ARN',
      );
    }

    const endpoint = normalizeAliyunStsEndpoint(
      readEnvFirst('STORAGE_STS_ENDPOINT')
      || getEnvString('STORAGE_ENDPOINT', '')
      || defaultAliyunStsEndpoint(this.region),
    );
    if (!endpoint) {
      throw new Error('执行阿里云 STS AssumeRole 需要可用的 STS endpoint');
    }

    const params: Record<string, string> = {
      AccessKeyId: this.accessKeyId,
      Action: 'AssumeRole',
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: '1.0',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Version: '2015-04-01',
      RoleArn: this.assumeRoleArn,
      RoleSessionName: buildRoleSessionName(requestId),
      DurationSeconds: String(this.durationSeconds),
    };
    if (this.externalId) {
      params.ExternalId = this.externalId;
    }
    params.Signature = signAliyunRpcParams(params, this.secretAccessKey);

    const response = await fetch(`${endpoint}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`阿里云 STS AssumeRole 调用失败: ${response.status} ${rawText}`);
    }
    const payload = safeParseJson(rawText);
    if (!payload) {
      throw new Error('阿里云 STS AssumeRole 返回了非法 JSON');
    }
    if (payload.Code && payload.Message) {
      throw new Error(
        `阿里云 STS AssumeRole 调用失败: ${pickString(payload.Code) ?? 'unknown'} ${pickString(payload.Message) ?? rawText}`,
      );
    }
    const credentials = asRecord(payload.Credentials);
    const accessKeyId = pickString(credentials.AccessKeyId);
    const secretAccessKey = pickString(credentials.AccessKeySecret);
    const sessionToken = pickString(credentials.SecurityToken);
    const expiration = pickString(credentials.Expiration);
    if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
      throw new Error('阿里云 STS AssumeRole 返回的临时凭证不完整');
    }
    const expiresAt = new Date(expiration).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      throw new Error('阿里云 STS AssumeRole 返回的过期时间非法');
    }

    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      expiresAt,
    };
  }
}

function readEnvNumber(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = getEnvString(name, undefined)?.trim();
    if (!raw) {
      continue;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function buildRoleSessionName(requestId: string): string {
  const cleaned = String(requestId || 'req')
    .replace(/[^a-zA-Z0-9+=,.@_-]/g, '_')
    .slice(0, 48);
  const suffix = Date.now().toString(36).slice(-6);
  return `lumimax-${cleaned}-${suffix}`.slice(0, 64);
}

function defaultAliyunStsEndpoint(region: string): string {
  const normalized = String(region ?? '').trim();
  if (!normalized) {
    return 'https://sts.aliyuncs.com';
  }
  return `https://sts.${normalized}.aliyuncs.com`;
}

function normalizeAliyunStsEndpoint(input: string): string {
  const value = String(input ?? '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.replace(/\/+$/, '');
  }
  return `https://${value.replace(/\/+$/, '')}`;
}

function signAliyunRpcParams(params: Record<string, string>, accessKeySecret: string): string {
  const canonicalized = Object.entries(params)
    .filter(([key]) => key !== 'Signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&');
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalized)}`;
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64');
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
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
