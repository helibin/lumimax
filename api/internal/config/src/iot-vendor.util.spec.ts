import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeIotVendor,
  normalizeStorageVendor,
  resolveConfiguredIotVendor,
  resolveConfiguredStorageProvider,
  resolveConfiguredStorageVendor,
} from './iot-vendor.util';

test('iot vendor supports emqx aliases and defaults', () => {
  assert.equal(normalizeIotVendor('emqx'), 'emqx');
  assert.equal(normalizeIotVendor('mqtt'), 'emqx');
  assert.equal(normalizeIotVendor('aliyun'), 'aliyun');
  assert.equal(normalizeIotVendor('aws'), 'aws');
});

test('storage vendor supports aws aliyun and minio aliases', () => {
  assert.equal(normalizeStorageVendor('aws'), 'aws');
  assert.equal(normalizeStorageVendor('s3'), 'aws');
  assert.equal(normalizeStorageVendor('aliyun-oss'), 'aliyun');
  assert.equal(normalizeStorageVendor('cos'), 'cos');
  assert.equal(normalizeStorageVendor('minio'), 'minio');
});

test('configured storage vendor prefers STORAGE_VENDOR and maps minio to s3 provider', () => {
  const previousVendor = process.env.STORAGE_VENDOR;
  const previousProvider = process.env.STORAGE_PROVIDER;
  try {
    process.env.STORAGE_VENDOR = 'minio';
    delete process.env.STORAGE_PROVIDER;
    assert.equal(resolveConfiguredStorageVendor(), 'minio');
    assert.equal(resolveConfiguredStorageProvider(), 's3');
  } finally {
    restoreEnv('STORAGE_VENDOR', previousVendor);
    restoreEnv('STORAGE_PROVIDER', previousProvider);
  }
});

test('configured iot vendor defaults to emqx', () => {
  const previousVendor = process.env.IOT_VENDOR;
  try {
    delete process.env.IOT_VENDOR;
    assert.equal(resolveConfiguredIotVendor(), 'emqx');
  } finally {
    restoreEnv('IOT_VENDOR', previousVendor);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
