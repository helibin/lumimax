import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessCode } from '../response/business-code';
import { getIotAccessErrorByReason, toIotAccessBusinessError } from './access-error';

test('maps topic mismatch reason to iot topic forbidden business error', () => {
  const definition = getIotAccessErrorByReason('topic_device_id_mismatch');
  assert.ok(definition);
  assert.equal(definition?.code, BusinessCode.IOT_TOPIC_FORBIDDEN);
  assert.equal(definition?.key, 'iot.topic_forbidden');
});

test('maps credential mismatch reason to iot credential business error', () => {
  const businessError = toIotAccessBusinessError('credential_not_matched');
  assert.deepEqual(businessError, {
    code: BusinessCode.IOT_CREDENTIAL_NOT_MATCHED,
    key: 'iot.credential_not_matched',
  });
});

test('returns undefined for unknown iot access reason', () => {
  assert.equal(getIotAccessErrorByReason('unknown_reason'), undefined);
  assert.equal(toIotAccessBusinessError('unknown_reason'), undefined);
});
