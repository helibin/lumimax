import { Injectable } from '@nestjs/common';
import {
  getEnvString,
  readEnvFirst,
  resolveAliyunCredentials,
  resolveAliyunRegion,
} from '@lumimax/config';
import type {
  CopyObjectInput,
  CreateSignedReadInput,
  CreateSignedUploadInput,
  StorageProviderInterface,
} from './storage-provider.interface';

@Injectable()
export class OssStorageProvider implements StorageProviderInterface {
  readonly name = 'oss' as const;

  async createSignedUpload(
    input: CreateSignedUploadInput,
  ): Promise<Record<string, unknown>> {
    const client = createOssClient(input.bucket, input.region);
    const uploadUrl = client.signatureUrl(input.objectKey, {
      method: 'PUT',
      expires: input.ttlSeconds,
      'Content-Type': input.contentType,
    });
    return {
      provider: this.name,
      bucket: input.bucket,
      region: input.region ?? '',
      objectKey: input.objectKey,
      ttlSeconds: input.ttlSeconds,
      uploadUrl,
    };
  }

  async createSignedRead(input: CreateSignedReadInput): Promise<string> {
    const client = createOssClient(input.bucket, input.region);
    return client.signatureUrl(input.objectKey, {
      method: 'GET',
      expires: input.ttlSeconds,
    });
  }

  async copyObject(input: CopyObjectInput): Promise<void> {
    const client = createOssClient(input.bucket, input.region);
    await client.copy(input.targetObjectKey, input.sourceObjectKey);
  }
}

function createOssClient(
  bucket?: string,
  region?: string,
): {
  signatureUrl(objectKey: string, options: Record<string, unknown>): string;
  copy(targetObjectKey: string, sourceObjectKey: string): Promise<unknown>;
} {
  const cloudCredentials = resolveAliyunCredentials();
  const accessKeyId = readEnvFirst('STORAGE_ACCESS_KEY_ID') ?? cloudCredentials?.accessKeyId;
  const accessKeySecret =
    readEnvFirst('STORAGE_ACCESS_KEY_SECRET') ?? cloudCredentials?.secretAccessKey;
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      'STORAGE_ACCESS_KEY_ID/STORAGE_ACCESS_KEY_SECRET are required for OSS signed URLs',
    );
  }
  const OSS = loadOssConstructor();
  const endpoint = readEnvFirst('STORAGE_ENDPOINT');
  return new OSS({
    region: region?.trim() || readEnvFirst('STORAGE_REGION') || resolveAliyunRegion() || 'oss-cn-hangzhou',
    bucket: bucket?.trim() || getEnvString('STORAGE_BUCKET') || '',
    accessKeyId,
    accessKeySecret,
    stsToken: readEnvFirst('STORAGE_STS_TOKEN') || undefined,
    endpoint: endpoint || undefined,
    secure: resolveSecure(endpoint),
  });
}

function loadOssConstructor(): new (options: Record<string, unknown>) => {
  signatureUrl(objectKey: string, options: Record<string, unknown>): string;
  copy(targetObjectKey: string, sourceObjectKey: string): Promise<unknown>;
} {
  return require('ali-oss') as new (options: Record<string, unknown>) => {
    signatureUrl(objectKey: string, options: Record<string, unknown>): string;
    copy(targetObjectKey: string, sourceObjectKey: string): Promise<unknown>;
  };
}

function resolveSecure(endpoint?: string): boolean {
  const configured = parseBooleanEnv(getEnvString('STORAGE_SECURE'));
  if (configured !== undefined) {
    return configured;
  }
  if (!endpoint) {
    return true;
  }
  return !endpoint.trim().toLowerCase().startsWith('http://');
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
}
