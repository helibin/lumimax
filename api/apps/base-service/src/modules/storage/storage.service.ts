import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateRequestId, getCurrentRequestId } from '@lumimax/runtime';
import {
  getEnvString,
  normalizeStorageVendor,
  resolveConfiguredStorageVendor,
} from '@lumimax/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  assertObjectKeyOwnedByPrefix,
  assertSafeObjectKey,
  extractObjectFilename,
  isTemporaryObjectKey,
  OssStorageProvider,
  S3StorageProvider,
} from '@lumimax/storage';
import type { Repository } from 'typeorm';
import { StorageObjectEntity } from '../system/entities/system.entities';
import type {
  StorageObjectRecord,
  StorageSignedReadResult,
  StorageUploadCredential,
} from './storage.types';
import { AwsStsService } from './aws-sts.service';
import { AliyunStsService } from './aliyun-sts.service';

@Injectable()
export class StorageService {
  private readonly defaultUploadMaxBytes = Number(
    getEnvString('STORAGE_UPLOAD_DEFAULT_MAX_BYTES', '1048576')!,
  );
  private readonly logger = new Logger(StorageService.name);
  private readonly vendor = resolveConfiguredStorageVendor();
  private readonly bucket = getEnvString('STORAGE_BUCKET', 'lumimax-dev')!;
  private readonly region = getEnvString('STORAGE_REGION', 'us-west-2')!;
  private readonly readBaseUrl = getEnvString(
    'STORAGE_PUBLIC_BASE_URL',
    'http://127.0.0.1:4000/file',
  )!;
  private readonly uploadTtlSeconds = Number(
    getEnvString('STORAGE_UPLOAD_TTL_SECONDS', '900')!,
  );
  private readonly readTtlSeconds = Number(
    getEnvString('STORAGE_READ_TTL_SECONDS', '600')!,
  );

  constructor(
    @InjectRepository(StorageObjectEntity)
    private readonly storageObjectRepository: Repository<StorageObjectEntity>,
    @Inject(AwsStsService) private readonly awsStsService: AwsStsService,
    @Inject(AliyunStsService) private readonly aliyunStsService: AliyunStsService,
    @Inject(S3StorageProvider) private readonly s3StorageProvider: S3StorageProvider,
    @Inject(OssStorageProvider) private readonly ossStorageProvider: OssStorageProvider,
  ) {}

  getStatus(): string {
    return 'base-storage-ready';
  }

  async createTemporaryUploadCredential(input: {
    tenantId?: string | null;
    deviceId?: string | null;
    userId?: string | null;
    mode?: 'presigned-url' | 'credentials' | null;
    filename?: string | null;
    maxFileSize?: number | null;
    allowedMimeTypes?: string[] | null;
    requestId?: string;
  }): Promise<StorageUploadCredential> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const owner = this.resolveOwner(input.userId, input.deviceId);
    const allowedMimeTypes = normalizeMimeTypes(input.allowedMimeTypes);
    const contentType = resolveUploadContentType(input.filename, allowedMimeTypes);
    const maxFileSize = Math.max(1, Number(input.maxFileSize ?? this.defaultUploadMaxBytes));
    const filename = input.filename ?? buildDefaultFilename(contentType);
    const objectKey = this.buildTemporaryObjectKey({
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      filename,
      requestId,
    });
    const now = Date.now();

    const vendor = normalizeVendor(this.vendor);
    const provider = normalizeProvider(vendor);

    // 重试幂等：相同 requestId 会生成相同 objectKey，因此复用同一条记录。
    const existingByRequest = await this.storageObjectRepository.findOne({
      where: { objectKey },
      order: { createdAt: 'DESC' },
    });
    const saved =
      existingByRequest
        ?? await this.storageObjectRepository.save(
          this.storageObjectRepository.create({
            tenantId: input.tenantId ?? null,
            objectKey,
            provider: vendor,
            bucket: this.bucket,
            region: this.region,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            userId: input.userId ?? null,
            deviceId: input.deviceId ?? null,
            status: 'pending',
          }),
        );

    const mode = this.resolveUploadMode(vendor, input.mode, owner.ownerType);

    if (mode === 'credentials') {
      const credentials = await this.createTemporaryCredentials(vendor, requestId);
      return {
        requestId,
        provider: vendor,
        bucket: this.bucket,
        region: this.region,
        objectKey: saved.objectKey,
        tmpPrefix: this.buildTemporaryObjectPrefix(owner.ownerType, owner.ownerId),
        mode: 'credentials',
        uploadMode: 'sts_credentials',
        credentials,
        uploadUrl: '',
        expiresAt: credentials.expiresAt,
        method: 'PUT',
        headers: contentType ? { 'Content-Type': contentType } : {},
        maxFileSize,
        allowedMimeTypes,
      };
    }

    const signedUpload = await this.resolveStorageProvider(provider).createSignedUpload({
      bucket: this.bucket,
      region: this.region,
      objectKey: saved.objectKey,
      ttlSeconds: this.uploadTtlSeconds,
      contentType,
    });

    return {
      requestId,
      provider: vendor,
      bucket: this.bucket,
      region: this.region,
      objectKey: saved.objectKey,
      tmpPrefix: this.buildTemporaryObjectPrefix(owner.ownerType, owner.ownerId),
      mode: 'presigned-url',
      uploadMode: 'presigned_put',
      credentials: null,
      uploadUrl: pickStringRecordField(signedUpload, 'uploadUrl'),
      expiresAt: now + this.uploadTtlSeconds * 1000,
      method: 'PUT',
      headers: contentType ? { 'Content-Type': contentType } : {},
      maxFileSize,
      allowedMimeTypes,
    };
  }

  private resolveUploadMode(
    provider: string,
    requestedMode?: 'presigned-url' | 'credentials' | null,
    ownerType?: 'user' | 'device' | 'system',
  ): 'presigned-url' | 'credentials' {
    if (ownerType === 'device') {
      return 'presigned-url';
    }
    if (requestedMode === 'presigned-url' || requestedMode === 'credentials') {
      return requestedMode;
    }
    return this.supportsCredentialMode(provider) ? 'credentials' : 'presigned-url';
  }

  private supportsCredentialMode(provider: string): boolean {
    const normalized = normalizeVendor(provider);
    if (normalized === 'aws') {
      return true;
    }
    if (normalized === 'aliyun') {
      return this.aliyunStsService.hasAssumeRoleConfig()
        || Boolean(readFirstEnv('STORAGE_STS_TOKEN', 'CLOUD_STS_TOKEN'));
    }
    if (normalized === 'minio') {
      return false;
    }
    return Boolean(readFirstEnv('STORAGE_STS_TOKEN', 'CLOUD_STS_TOKEN'));
  }

  private async createTemporaryCredentials(
    provider: string,
    requestId: string,
  ): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiresAt: number;
  }> {
    const normalized = normalizeVendor(provider);
    if (normalized === 'aws') {
      return this.awsStsService.assumeRole(requestId);
    }
    if (normalized === 'aliyun') {
      if (this.aliyunStsService.hasAssumeRoleConfig()) {
        return this.aliyunStsService.assumeRole(requestId);
      }
      return this.createAliyunStaticTemporaryCredentials();
    }
    if (normalized === 'minio') {
      throw new Error('MinIO 仅支持 presigned-url 上传模式');
    }
    return this.createAliyunStaticTemporaryCredentials();
  }

  private createAliyunStaticTemporaryCredentials(): {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiresAt: number;
  } {
    const accessKeyId = readFirstEnv(
      'STORAGE_ACCESS_KEY_ID',
      'CLOUD_ACCESS_KEY_ID',
    );
    const secretAccessKey = readFirstEnv(
      'STORAGE_ACCESS_KEY_SECRET',
      'CLOUD_ACCESS_KEY_SECRET',
    );
    const sessionToken = readFirstEnv('STORAGE_STS_TOKEN', 'CLOUD_STS_TOKEN');
    if (!accessKeyId || !secretAccessKey || !sessionToken) {
      throw new Error(
        '阿里云 OSS 临时凭证模式需要配置 STORAGE_ACCESS_KEY_ID/STORAGE_ACCESS_KEY_SECRET/STORAGE_STS_TOKEN，或对应的 CLOUD_* 环境变量，或者配置 STORAGE_STS_ROLE_ARN 使用 AssumeRole',
      );
    }
    const expiresAt =
      Date.now()
      + Math.max(60, Number(getEnvString('STORAGE_UPLOAD_TTL_SECONDS', '900') ?? '900')) * 1000;
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      expiresAt,
    };
  }

  async validateObjectKeys(input: {
    objectKey?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    requestId?: string;
  }): Promise<Record<string, unknown>> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const objectKey = assertSafeObjectKey(input.objectKey ?? '');
    const record = await this.findRecordByObjectKey(objectKey);
    if (record) {
      this.assertOwnership(record, input.userId, input.deviceId);
    } else {
      this.assertScopedObjectKey(objectKey, input.userId, input.deviceId);
    }

    return {
      ok: true,
      requestId,
      objectKey,
      ownerType: record?.ownerType ?? null,
      ownerId: record?.ownerId ?? null,
      status: record?.status ?? 'external',
    };
  }

  async confirmUploadedObjects(input: {
    tenantId?: string | null;
    objectKey?: string | null;
    provider?: string | null;
    bucket?: string | null;
    region?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    requestId?: string;
  }): Promise<Record<string, unknown>> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const objectKey = assertSafeObjectKey(input.objectKey ?? '');
    this.assertScopedObjectKey(objectKey, input.userId, input.deviceId);
    const current =
      (await this.findRecordByObjectKey(objectKey))
      ?? (await this.createDetachedPendingRecord(
        objectKey,
        input.tenantId ?? null,
        input.userId,
        input.deviceId,
        requestId,
      ));
    current.status = 'confirmed';
    current.provider = normalizeVendor(input.provider?.trim() || current.provider || this.vendor);
    current.bucket = input.bucket?.trim() || current.bucket || this.bucket;
    current.region = input.region?.trim() || current.region || this.region;
    current.requestId = requestId;
    await this.saveRecord(current);

    return {
      ok: true,
      requestId,
      objectKey,
      provider: current.provider,
      bucket: current.bucket,
      region: current.region,
      status: current.status,
    };
  }

  async promoteObjectKey(input: {
    tenantId?: string | null;
    sourceObjectKey?: string | null;
    imageKey?: string | null;
    userId?: string | null;
    deviceId?: string | null;
    bizId?: string | null;
    mealRecordId?: string | null;
    bizType?: string | null;
    mediaType?: string | null;
    requestId?: string;
  }): Promise<Record<string, unknown>> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const sourceObjectKey = assertSafeObjectKey(
      input.sourceObjectKey ?? input.imageKey ?? '',
    );
    const bizId = String(input.bizId ?? input.mealRecordId ?? '').trim();
    if (!bizId) {
      throw new Error('bizId 不能为空');
    }

    this.assertScopedObjectKey(sourceObjectKey, input.userId, input.deviceId);
    const current =
      (await this.findRecordByObjectKey(sourceObjectKey))
      ?? (await this.createDetachedPendingRecord(
        sourceObjectKey,
        input.tenantId ?? null,
        input.userId,
        input.deviceId,
        requestId,
      ));
    this.assertOwnership(current, input.userId, input.deviceId);

    const targetObjectKey = this.buildPermanentObjectKey({
      sourceObjectKey,
      userId: input.userId,
      deviceId: input.deviceId,
      bizType: input.bizType ?? 'diet',
      bizId,
      mediaType: input.mediaType ?? 'image',
    });
    const promoted: StorageObjectRecord = {
      ...current,
      objectKey: targetObjectKey,
      status: 'promoted',
      bizId,
      bizType: input.bizType ?? 'diet',
      mediaType: input.mediaType ?? 'image',
      updatedAt: new Date().toISOString(),
      requestId,
    };

    if (targetObjectKey !== sourceObjectKey) {
      await this.resolveStorageProvider(promoted.provider).copyObject({
        sourceObjectKey,
        targetObjectKey,
        bucket: promoted.bucket,
        region: promoted.region,
      });
    }

    await this.saveRecord(promoted);
    if (targetObjectKey !== sourceObjectKey) {
      const existing = await this.storageObjectRepository.findOne({
        where: { objectKey: sourceObjectKey },
        withDeleted: true,
      });
      if (existing) {
        await this.storageObjectRepository.softDelete(existing.id);
      }
      this.logger.debug(
        `存储对象已转正 ${JSON.stringify({
          requestId,
          sourceObjectKey,
          targetObjectKey,
          provider: promoted.provider,
          bucket: promoted.bucket,
        })}`,
      );
    }

    return {
      ok: true,
      requestId,
      sourceObjectKey,
      objectKey: targetObjectKey,
      imageKey: targetObjectKey,
      provider: promoted.provider,
      bucket: promoted.bucket,
      region: promoted.region,
      status: promoted.status,
    };
  }

  async createSignedReadUrl(input: {
    objectKey?: string | null;
    ttlSeconds?: number | null;
    requestId?: string;
  }): Promise<StorageSignedReadResult> {
    const requestId = input.requestId ?? getCurrentRequestId() ?? generateRequestId();
    const objectKey = assertSafeObjectKey(input.objectKey ?? '');
    const record = await this.findRecordByObjectKey(objectKey);
    const provider = normalizeVendor(record?.provider || this.vendor);
    const bucket = record?.bucket || this.bucket;
    const region = record?.region || this.region;
    const ttlSeconds = Math.max(60, Number(input.ttlSeconds ?? this.readTtlSeconds));
    const readUrl = await this.resolveStorageProvider(normalizeProvider(provider)).createSignedRead({
      objectKey,
      ttlSeconds,
      bucket,
      region,
      baseUrl: this.readBaseUrl,
    });

    return {
      requestId,
      objectKey,
      readUrl,
      expiresAt: Date.now() + ttlSeconds * 1000,
      provider,
      bucket,
      region,
    };
  }

  private resolveOwner(
    userId?: string | null,
    deviceId?: string | null,
  ): { ownerType: 'user' | 'device' | 'system'; ownerId: string } {
    if (userId?.trim()) {
      return { ownerType: 'user', ownerId: userId.trim() };
    }
    if (deviceId?.trim()) {
      return { ownerType: 'device', ownerId: deviceId.trim() };
    }
    return { ownerType: 'system', ownerId: 'system' };
  }

  private async createDetachedPendingRecord(
    objectKey: string,
    tenantId: string | null | undefined,
    userId: string | null | undefined,
    deviceId: string | null | undefined,
    _requestId: string,
  ): Promise<StorageObjectRecord> {
    const owner = this.resolveOwner(userId, deviceId);
    const existing = await this.storageObjectRepository.findOne({
      where: { objectKey },
      withDeleted: true,
    });
    const entity = await this.storageObjectRepository.save(
      this.storageObjectRepository.create({
        id: existing?.id,
        tenantId: tenantId ?? null,
        objectKey,
        provider: this.vendor,
        bucket: this.bucket,
        region: this.region,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        userId: userId ?? null,
        deviceId: deviceId ?? null,
        status: 'pending',
        creatorId: existing?.creatorId ?? null,
        editorId: existing?.editorId ?? null,
        deletedAt: null,
      }),
    );
    const persisted =
      entity.createdAt && entity.updatedAt
        ? entity
        : await this.storageObjectRepository.findOneOrFail({
            where: { objectKey },
            withDeleted: true,
          });
    return this.toRecord(persisted);
  }

  private assertOwnership(
    record: StorageObjectRecord,
    userId?: string | null,
    deviceId?: string | null,
  ): void {
    if (record.userId && userId && record.userId !== userId) {
      throw new Error('objectKey 用户权限不足，拒绝访问');
    }
    if (record.deviceId && deviceId && record.deviceId !== deviceId) {
      throw new Error('objectKey 设备权限不足，拒绝访问');
    }
  }

  private assertScopedObjectKey(
    objectKey: string,
    userId?: string | null,
    deviceId?: string | null,
  ): void {
    if (userId?.trim()) {
      assertObjectKeyOwnedByPrefix(objectKey, `tmp-file/user/${userId.trim()}`);
      return;
    }
    if (deviceId?.trim()) {
      assertObjectKeyOwnedByPrefix(objectKey, `tmp-file/device/${deviceId.trim()}`);
      return;
    }
    if (!isTemporaryObjectKey(objectKey)) {
      throw new Error('匿名 objectKey 必须位于 tmp-file 临时目录范围内');
    }
  }

  private async findRecordByObjectKey(
    objectKey: string,
  ): Promise<StorageObjectRecord | null> {
    const entity = await this.storageObjectRepository.findOne({
      where: { objectKey },
      order: { createdAt: 'DESC' },
    });
    return entity ? this.toRecord(entity) : null;
  }

  private async saveRecord(record: StorageObjectRecord): Promise<void> {
    const existing = await this.storageObjectRepository.findOne({
      where: { objectKey: record.objectKey },
      withDeleted: true,
    });
    const entity = this.storageObjectRepository.create({
      id: existing?.id,
      objectKey: record.objectKey,
      provider: record.provider,
      bucket: record.bucket,
      region: record.region,
      ownerType: record.ownerType,
      ownerId: record.ownerId,
      status: record.status,
      userId: record.userId ?? null,
      deviceId: record.deviceId ?? null,
      bizType: record.bizType ?? null,
      bizId: record.bizId ?? null,
      mediaType: record.mediaType ?? null,
      creatorId: existing?.creatorId ?? null,
      editorId: existing?.editorId ?? null,
      deletedAt: null,
    });
    await this.storageObjectRepository.save(entity);
  }

  private toRecord(entity: StorageObjectEntity): StorageObjectRecord {
    return {
      objectKey: entity.objectKey,
      provider: entity.provider,
      bucket: entity.bucket,
      region: entity.region,
      ownerType: entity.ownerType as 'user' | 'device' | 'system',
      ownerId: entity.ownerId,
      userId: entity.userId ?? null,
      deviceId: entity.deviceId ?? null,
      status: entity.status as 'pending' | 'confirmed' | 'promoted',
      bizType: entity.bizType ?? null,
      bizId: entity.bizId ?? null,
      mediaType: entity.mediaType ?? null,
      createdAt: toIsoString(entity.createdAt),
      updatedAt: toIsoString(entity.updatedAt),
    };
  }

  private buildTemporaryObjectKey(input: {
    ownerType: 'user' | 'device' | 'system';
    ownerId: string;
    filename: string;
    requestId: string;
  }): string {
    const filename = sanitizeFilename(input.filename);
    const stamped = appendFilenameSuffix(filename, input.requestId);
    return `${this.buildTemporaryObjectPrefix(input.ownerType, input.ownerId)}/${stamped}`;
  }

  private buildTemporaryObjectPrefix(
    ownerType: 'user' | 'device' | 'system',
    ownerId: string,
  ): string {
    if (ownerType === 'user') {
      return `tmp-file/user/${ownerId}`;
    }
    if (ownerType === 'device') {
      return `tmp-file/device/${ownerId}`;
    }
    return 'tmp-file/system';
  }

  private buildPermanentObjectKey(input: {
    sourceObjectKey: string;
    userId?: string | null;
    deviceId?: string | null;
    bizType: string;
    bizId: string;
    mediaType: string;
  }): string {
    const filename = sanitizeFilename(extractObjectFilename(input.sourceObjectKey));
    if (input.userId?.trim()) {
      return `file/user/${input.userId.trim()}/${input.bizType}/${input.bizId}/${input.mediaType}/${filename}`;
    }
    return `file/device/${(input.deviceId ?? 'unknown').trim()}/${input.bizType}/${input.bizId}/${input.mediaType}/${filename}`;
  }

  private resolveStorageProvider(provider: string): S3StorageProvider | OssStorageProvider {
    return provider === 'oss' ? this.ossStorageProvider : this.s3StorageProvider;
  }
}

function toIsoString(value: Date | string | undefined | null): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

function normalizeProvider(provider: string): string {
  return normalizeVendor(provider) === 'aliyun' ? 'oss' : 's3';
}

function normalizeVendor(provider: string): string {
  return normalizeStorageVendor(provider);
}

function readFirstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = getEnvString(name)?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function resolveUploadContentType(
  filename: string | null | undefined,
  allowedMimeTypes?: string[] | null,
): string | undefined {
  const normalizedAllowed = normalizeMimeTypes(allowedMimeTypes);
  if (normalizedAllowed.length > 0) {
    return normalizedAllowed[0];
  }

  const lowerFilename = String(filename ?? '').trim().toLowerCase();
  if (lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowerFilename.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerFilename.endsWith('.webp')) {
    return 'image/webp';
  }
  return undefined;
}

function normalizeMimeTypes(allowedMimeTypes?: string[] | null): string[] {
  return (allowedMimeTypes ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildDefaultFilename(contentType?: string): string {
  switch ((contentType ?? '').trim().toLowerCase()) {
    case 'image/jpeg':
      return 'upload.jpg';
    case 'image/png':
      return 'upload.png';
    case 'image/webp':
      return 'upload.webp';
    default:
      return 'upload.bin';
  }
}

function pickStringRecordField(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new Error(`存储预签名上传结果缺少字段 ${key}`);
}

function sanitizeFilename(filename: string): string {
  return String(filename || 'upload.bin')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+/g, '')
    || 'upload.bin';
}

function appendFilenameSuffix(filename: string, requestId: string): string {
  const normalizedRequestId = String(requestId || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '');
  if (!normalizedRequestId) {
    return filename;
  }
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex > 0 && dotIndex < filename.length - 1) {
    const base = filename.slice(0, dotIndex);
    const ext = filename.slice(dotIndex);
    return `${base}_${normalizedRequestId}${ext}`;
  }
  return `${filename}_${normalizedRequestId}`;
}
