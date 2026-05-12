import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import { BaseStorageGrpcAdapter } from '../../grpc/base-service.grpc-client';

@Injectable()
export class DietImageStorageService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(BaseStorageGrpcAdapter)
    private readonly baseStorageGrpcAdapter: BaseStorageGrpcAdapter,
  ) {}

  async prepareSingleImage(input: {
    requestId: string;
    imageKey: string;
    mealRecordId: string;
    userId?: string | null;
    deviceId?: string | null;
  }): Promise<{
    imageKey: string;
    imageObjectKey: string;
    objectKey: string;
    readUrl?: string;
    provider?: string;
    bucket?: string;
    region?: string;
  }> {
    const ownershipScope = resolveOwnershipScope(input.imageKey, input.userId, input.deviceId);
    this.logger.log(
      '准备识别图片',
      {
        requestId: input.requestId,
        idLabel: 'ReqId',
        imageKey: input.imageKey,
        mealRecordId: input.mealRecordId,
        scope: ownershipScope.deviceId ? 'device' : ownershipScope.userId ? 'user' : 'unknown',
      },
      DietImageStorageService.name,
    );

    await this.baseStorageGrpcAdapter.validateObjectKeys<Record<string, unknown>>(
      {
        requestId: input.requestId,
        imageKey: input.imageKey,
        objectKey: input.imageKey,
        sourceObjectKey: input.imageKey,
        userId: ownershipScope.userId,
        deviceId: ownershipScope.deviceId,
      },
      input.requestId,
    );

    const promoted = await this.baseStorageGrpcAdapter.promoteObjectKey<Record<string, unknown>>(
      {
        requestId: input.requestId,
        imageKey: input.imageKey,
        sourceObjectKey: input.imageKey,
        mealRecordId: input.mealRecordId,
        bizId: input.mealRecordId,
        bizType: 'diet',
        mediaType: 'image',
        userId: ownershipScope.userId,
        deviceId: ownershipScope.deviceId,
      },
      input.requestId,
    );

    const objectKey =
      pickString(promoted.objectKey)
      || pickString(promoted.imageKey)
      || input.imageKey;
    const signedRead =
      await this.baseStorageGrpcAdapter.createSignedReadUrl<Record<string, unknown>>(
        {
          objectKey,
        },
        input.requestId,
      );
    const readUrl = pickString(signedRead.readUrl);
    this.logger.log(
      '已生成图片临时访问链接',
      {
        requestId: input.requestId,
        idLabel: 'ReqId',
        objectKey,
        provider: pickString(promoted.provider) ?? 'unknown',
        bucket: pickString(promoted.bucket) ?? 'unknown',
        region: pickString(promoted.region) ?? 'unknown',
        hasReadUrl: Boolean(readUrl),
        readUrlHost: pickUrlHost(readUrl) ?? 'unknown',
      },
      DietImageStorageService.name,
    );

    return {
      imageKey: objectKey,
      imageObjectKey: objectKey,
      objectKey,
      readUrl,
      provider: pickString(promoted.provider),
      bucket: pickString(promoted.bucket),
      region: pickString(promoted.region),
    };
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickUrlHost(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
}

function resolveOwnershipScope(
  imageKey: string,
  userId?: string | null,
  deviceId?: string | null,
): { userId: string | null; deviceId: string | null } {
  const normalizedKey = pickString(imageKey) ?? '';
  if (normalizedKey.startsWith('tmp-file/device/')) {
    return {
      userId: null,
      deviceId: pickString(deviceId) ?? null,
    };
  }
  if (normalizedKey.startsWith('tmp-file/user/')) {
    return {
      userId: pickString(userId) ?? null,
      deviceId: null,
    };
  }
  return {
    userId: pickString(userId) ?? null,
    deviceId: pickString(deviceId) ?? null,
  };
}
