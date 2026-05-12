import { Inject, Injectable } from '@nestjs/common';
import { StorageService } from './storage.service';

@Injectable()
export class StorageFacadeService {
  constructor(
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  async execute(input: {
    operation: string;
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    user: Record<string, unknown> | null;
    tenantScope?: string;
    requestId: string;
  }) {
    const body = input.body ?? {};
    switch (input.operation) {
      case 'storage.createTemporaryUploadCredential':
      case 'storage.objects.createUploadToken':
      case 'storage.objects.createTemporaryUploadCredential':
        return this.storageService.createTemporaryUploadCredential({
          tenantId: input.tenantScope?.trim() || pickString(body.tenantId) || null,
          deviceId: pickString(body.deviceId),
          userId: pickString(body.userId),
          mode: pickString(body.mode) as 'presigned-url' | 'credentials' | undefined,
          filename: pickString(body.filename),
          maxFileSize: pickNumber(body.maxBytes) ?? pickNumber(body.maxFileSize),
          allowedMimeTypes: pickMimeTypes(body),
          requestId: input.requestId,
        });
      case 'storage.validateObjectKeys':
      case 'storage.objects.validate':
        return this.storageService.validateObjectKeys({
          objectKey: pickString(body.objectKey),
          userId: pickString(body.userId),
          deviceId: pickString(body.deviceId),
          requestId: input.requestId,
        });
      case 'storage.confirmUploadedObjects':
      case 'storage.objects.confirm':
        return this.storageService.confirmUploadedObjects({
          tenantId: input.tenantScope?.trim() || pickString(body.tenantId) || null,
          objectKey: pickString(body.objectKey),
          provider: pickString(body.provider),
          bucket: pickString(body.bucket),
          region: pickString(body.region),
          userId: pickString(body.userId),
          deviceId: pickString(body.deviceId),
          requestId: input.requestId,
        });
      case 'storage.promoteObjectKey':
        return this.storageService.promoteObjectKey({
          tenantId: input.tenantScope?.trim() || pickString(body.tenantId) || null,
          sourceObjectKey: pickString(body.sourceObjectKey),
          imageKey: pickString(body.imageKey),
          userId: pickString(body.userId),
          deviceId: pickString(body.deviceId),
          bizId: pickString(body.bizId),
          mealRecordId: pickString(body.mealRecordId),
          bizType: pickString(body.bizType),
          mediaType: pickString(body.mediaType),
          requestId: input.requestId,
        });
      case 'storage.createSignedReadUrl':
      case 'storage.objects.createSignedReadUrl':
        return this.storageService.createSignedReadUrl({
          objectKey: pickString(body.objectKey),
          ttlSeconds: pickNumber(body.ttlSeconds),
          requestId: input.requestId,
        });
      default:
        throw new Error(`unsupported storage operation: ${input.operation}`);
    }
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return items.length > 0 ? items : undefined;
}

function pickMimeTypes(body: Record<string, unknown>): string[] | undefined {
  const fileType = pickString(body.fileType);
  if (fileType) {
    return [fileType];
  }
  return pickStringArray(body.allowedMimeTypes) ?? pickStringArray(body.fileTypes);
}
