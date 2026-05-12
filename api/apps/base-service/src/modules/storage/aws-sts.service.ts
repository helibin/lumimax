import { Injectable } from '@nestjs/common';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { getEnvString, readEnvFirst, resolveCloudCredentials, resolveCloudRegion } from '@lumimax/config';

export interface AwsStsAssumeRoleResult {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: number;
}

@Injectable()
export class AwsStsService {
  private readonly region = readEnvFirst('STORAGE_REGION') ?? resolveCloudRegion() ?? '';
  private readonly cloudCredentials = resolveCloudCredentials();
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

  async assumeRole(requestId: string): Promise<AwsStsAssumeRoleResult> {
    if (!this.region) {
      throw new Error('执行 AWS STS AssumeRole 需要配置 STORAGE_REGION 或 CLOUD_REGION');
    }
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error(
        '执行 AWS STS AssumeRole 需要配置 STORAGE_ACCESS_KEY_ID/STORAGE_ACCESS_KEY_SECRET，或对应的 CLOUD_ACCESS_KEY_ID/CLOUD_ACCESS_KEY_SECRET',
      );
    }
    if (!this.assumeRoleArn) {
      throw new Error('执行 AWS STS AssumeRole 需要配置 STORAGE_STS_ROLE_ARN 或 CLOUD_STS_ROLE_ARN');
    }

    const client = new STSClient({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });

    const sessionName = buildRoleSessionName(requestId);
    const command = new AssumeRoleCommand({
      RoleArn: this.assumeRoleArn,
      RoleSessionName: sessionName,
      DurationSeconds: this.durationSeconds,
      ...(this.externalId ? { ExternalId: this.externalId } : {}),
    });
    const reply = await client.send(command);
    const creds = reply.Credentials;
    if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken || !creds.Expiration) {
      throw new Error('AWS STS AssumeRole 返回的临时凭证不完整');
    }

    return {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
      expiresAt: creds.Expiration.getTime(),
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
