import assert from 'node:assert/strict';
import test from 'node:test';
import { signTencentCloudRequest } from './tencent-cloud-sign.util';

test('builds TC3 authorization headers', () => {
  const signed = signTencentCloudRequest({
    secretId: 'AKIDTEST',
    secretKey: 'secret',
    service: 'asr',
    host: 'asr.tencentcloudapi.com',
    region: 'ap-guangzhou',
    action: 'SentenceRecognition',
    version: '2019-06-14',
    payload: { ProjectId: 0 },
  });

  assert.match(signed.headers.Authorization, /TC3-HMAC-SHA256/);
  assert.equal(signed.headers['X-TC-Action'], 'SentenceRecognition');
  assert.match(signed.body, /ProjectId/);
});
