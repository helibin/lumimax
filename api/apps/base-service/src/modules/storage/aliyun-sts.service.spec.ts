import assert from 'node:assert/strict';
import test from 'node:test';
import { AliyunStsService } from './aliyun-sts.service';

test('aliyun sts assumeRole returns temporary credentials', async () => {
  const restoreEnv = stashEnv([
    ['STORAGE_REGION', 'cn-hangzhou'],
    ['STORAGE_ACCESS_KEY_ID', 'test-ak'],
    ['STORAGE_ACCESS_KEY_SECRET', 'test-sk'],
    ['STORAGE_STS_ROLE_ARN', 'acs:ram::1234567890123456:role/demo-role'],
    ['STORAGE_STS_ENDPOINT', 'https://sts.cn-hangzhou.aliyuncs.com'],
  ]);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: string }> = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: String(init?.body ?? ''),
    });
    return new Response(
      JSON.stringify({
        Credentials: {
          AccessKeyId: 'sts-ak',
          AccessKeySecret: 'sts-sk',
          SecurityToken: 'sts-token',
          Expiration: '2026-05-09T09:00:00Z',
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const service = new AliyunStsService();
    const result = await service.assumeRole('req-aliyun-sts-001');
    assert.equal(result.accessKeyId, 'sts-ak');
    assert.equal(result.secretAccessKey, 'sts-sk');
    assert.equal(result.sessionToken, 'sts-token');
    assert.equal(result.expiresAt, new Date('2026-05-09T09:00:00Z').getTime());
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://sts.cn-hangzhou.aliyuncs.com/');
    assert.match(requests[0].body, /Action=AssumeRole/);
    assert.match(requests[0].body, /RoleArn=acs%3Aram%3A%3A1234567890123456%3Arole%2Fdemo-role/);
    assert.match(requests[0].body, /Signature=/);
  } finally {
    globalThis.fetch = originalFetch;
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
