import { getEnvString } from './runtime-env';

export type CloudIotVendorName = 'aws' | 'emqx';
export type StorageVendorName = 'aws' | 'aliyun' | 'cos' | 'minio';

export function resolveConfiguredIotVendor(): CloudIotVendorName {
  return normalizeIotVendor(getEnvString('IOT_VENDOR', 'emqx') ?? 'emqx');
}

export function resolveConfiguredStorageProvider(): 's3' | 'oss' {
  return resolveConfiguredStorageVendor() === 'aliyun' ? 'oss' : 's3';
}

export function resolveConfiguredStorageVendor(): StorageVendorName {
  return normalizeStorageVendor(
    getEnvString('STORAGE_VENDOR')
    ?? getEnvString('STORAGE_PROVIDER')
    ?? getEnvString('IOT_VENDOR')
    ?? 'aws',
  );
}

export function normalizeIotVendor(value: unknown): CloudIotVendorName {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['emqx', 'emqx-ee', 'emqx-ce', 'mqtt'].includes(normalized)) {
    return 'emqx';
  }
  return 'aws';
}

export function normalizeStorageVendor(value: unknown): StorageVendorName {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['aliyun', 'aly', 'oss', 'aliyun-oss'].includes(normalized)) {
    return 'aliyun';
  }
  if (['cos', 'tencent', 'tencent-cos'].includes(normalized)) {
    return 'cos';
  }
  if (['minio', 'mino'].includes(normalized)) {
    return 'minio';
  }
  if (['aws', 's3', 'aws-s3'].includes(normalized)) {
    return 'aws';
  }
  return 'aws';
}
