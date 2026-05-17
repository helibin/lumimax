import { Injectable } from '@nestjs/common';
import {
  getEnvString,
  readEnvFirst,
  resolveCloudCredentials,
  resolveCloudRegion,
  resolveConfiguredStorageVendor,
} from '@lumimax/config';
import {
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  CopyObjectInput,
  CreateSignedReadInput,
  CreateSignedUploadInput,
  StorageProviderInterface,
} from './storage-provider.interface';

@Injectable()
export class S3StorageProvider implements StorageProviderInterface {
  readonly name = 's3' as const;

  async createSignedUpload(
    input: CreateSignedUploadInput,
  ): Promise<Record<string, unknown>> {
    const client = createS3Client(input.region);
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
      }),
      { expiresIn: input.ttlSeconds },
    );
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
    const client = createS3Client(input.region);
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
      }),
      { expiresIn: input.ttlSeconds },
    );
  }

  async copyObject(input: CopyObjectInput): Promise<void> {
    const client = createS3Client(input.region);
    await client.send(
      new CopyObjectCommand({
        Bucket: input.bucket,
        Key: input.targetObjectKey,
        CopySource: `${input.bucket}/${encodeCopySourceKey(input.sourceObjectKey)}`,
      }),
    );
  }
}

function createS3Client(region?: string): S3Client {
  const cloudCredentials = resolveCloudCredentials();
  const accessKeyId = readEnvFirst('STORAGE_ACCESS_KEY_ID') ?? cloudCredentials?.accessKeyId;
  const secretAccessKey =
    readEnvFirst('STORAGE_ACCESS_KEY_SECRET') ?? cloudCredentials?.secretAccessKey;
  const sessionToken = readEnvFirst('STORAGE_STS_TOKEN');
  const endpoint = readEnvFirst('STORAGE_ENDPOINT');
  const vendor = resolveConfiguredStorageVendor();
  return new S3Client({
    region: region?.trim() || readEnvFirst('STORAGE_REGION') || resolveCloudRegion() || 'us-west-2',
    endpoint: endpoint || undefined,
    forcePathStyle: resolveForcePathStyle(vendor, endpoint),
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            sessionToken: sessionToken || undefined,
          }
        : undefined,
  });
}

function encodeCopySourceKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolveForcePathStyle(vendor: string, endpoint?: string): boolean {
  const configured = parseBooleanEnv(getEnvString('STORAGE_FORCE_PATH_STYLE'));
  if (configured !== undefined) {
    return configured;
  }
  return vendor === 'minio' || Boolean(endpoint);
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
