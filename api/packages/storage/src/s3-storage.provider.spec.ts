import assert from 'node:assert/strict';
import test from 'node:test';
import { S3StorageProvider } from './s3-storage.provider';

test('minio signed upload uses configured endpoint and path-style URL', async () => {
  const restore = stashEnv([
    ['STORAGE_VENDOR', 'minio'],
    ['STORAGE_REGION', 'us-east-1'],
    ['STORAGE_ENDPOINT', 'http://minio.local:9000'],
    ['STORAGE_ACCESS_KEY_ID', 'minioadmin'],
    ['STORAGE_ACCESS_KEY_SECRET', 'minioadmin'],
    ['STORAGE_FORCE_PATH_STYLE', 'true'],
  ]);
  try {
    const provider = new S3StorageProvider();
    const result = await provider.createSignedUpload({
      bucket: 'demo-bucket',
      region: 'us-east-1',
      objectKey: 'tmp-file/device/demo/upload.jpg',
      ttlSeconds: 900,
      contentType: 'image/jpeg',
    });
    const uploadUrl = String(result.uploadUrl ?? '');
    assert.match(uploadUrl, /^http:\/\/minio\.local:9000\/demo-bucket\/tmp-file\/device\/demo\/upload\.jpg\?/);
    assert.match(uploadUrl, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
    assert.match(uploadUrl, /X-Amz-SignedHeaders=host/);
  } finally {
    restore();
  }
});

function stashEnv(entries: Array<[string, string]>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of entries) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}
