import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { OssStorageProvider } from './oss-storage.provider';

test('oss provider respects endpoint protocol and sts token', async () => {
  const restoreEnv = stashEnv([
    ['STORAGE_REGION', 'oss-cn-hangzhou'],
    ['STORAGE_BUCKET', 'demo-bucket'],
    ['STORAGE_ENDPOINT', 'http://oss-cn-hangzhou-internal.aliyuncs.com'],
    ['STORAGE_ACCESS_KEY_ID', 'test-ak'],
    ['STORAGE_ACCESS_KEY_SECRET', 'test-sk'],
    ['STORAGE_STS_TOKEN', 'test-sts'],
  ]);
  const calls: Array<Record<string, unknown>> = [];
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function patchedRequire(id: string) {
    if (id === 'ali-oss') {
      return class MockOss {
        constructor(options: Record<string, unknown>) {
          calls.push({ type: 'constructor', ...options });
        }

        signatureUrl(objectKey: string, options: Record<string, unknown>): string {
          calls.push({ type: 'signatureUrl', objectKey, ...options });
          return `signed:${objectKey}`;
        }

        async copy(targetObjectKey: string, sourceObjectKey: string): Promise<void> {
          calls.push({ type: 'copy', targetObjectKey, sourceObjectKey });
        }
      };
    }
    return originalRequire.apply(this, arguments as unknown as [string]);
  };

  try {
    const provider = new OssStorageProvider();
    const upload = await provider.createSignedUpload({
      bucket: 'demo-bucket',
      region: 'oss-cn-hangzhou',
      objectKey: 'tmp-file/device/demo/upload.jpg',
      ttlSeconds: 600,
      contentType: 'image/jpeg',
    });
    assert.equal(upload.uploadUrl, 'signed:tmp-file/device/demo/upload.jpg');
    assert.deepEqual(calls[0], {
      type: 'constructor',
      region: 'oss-cn-hangzhou',
      bucket: 'demo-bucket',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      stsToken: 'test-sts',
      endpoint: 'http://oss-cn-hangzhou-internal.aliyuncs.com',
      secure: false,
    });
    assert.deepEqual(calls[1], {
      type: 'signatureUrl',
      objectKey: 'tmp-file/device/demo/upload.jpg',
      method: 'PUT',
      expires: 600,
      'Content-Type': 'image/jpeg',
    });
  } finally {
    Module.prototype.require = originalRequire;
    restoreEnv();
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
