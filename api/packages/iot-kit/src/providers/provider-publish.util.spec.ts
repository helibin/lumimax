import assert from 'node:assert';
import test from 'node:test';
import { remapMqttTlsPortToEmqxRestApiPort, resolveEmqxRestBaseUrl } from './provider-publish.util';

test('resolveEmqxRestBaseUrl: mqtts :8883 → http :18083 (EMQX REST 明文)', () => {
  assert.equal(resolveEmqxRestBaseUrl('mqtts://emqx:8883'), 'http://emqx:18083');
});

test('resolveEmqxRestBaseUrl: bare host:8883 → http :18083', () => {
  assert.equal(resolveEmqxRestBaseUrl('127.0.0.1:8883'), 'http://127.0.0.1:18083');
});

test('resolveEmqxRestBaseUrl: explicit https URL is not rewritten', () => {
  assert.equal(resolveEmqxRestBaseUrl('https://127.0.0.1:8883'), 'https://127.0.0.1:8883');
});

test('remapMqttTlsPortToEmqxRestApiPort: https + 18083 → http（避免 TLS 对明文端口）', () => {
  assert.equal(remapMqttTlsPortToEmqxRestApiPort('https://h:18083'), 'http://h:18083');
});

test('remapMqttTlsPortToEmqxRestApiPort: :8883 → :18083', () => {
  assert.equal(remapMqttTlsPortToEmqxRestApiPort('http://h:8883'), 'http://h:18083');
});

test('remapMqttTlsPortToEmqxRestApiPort: host without port → 18083', () => {
  assert.equal(remapMqttTlsPortToEmqxRestApiPort('http://emqx'), 'http://emqx:18083');
});

test('remapMqttTlsPortToEmqxRestApiPort: leaves non-default REST port', () => {
  assert.equal(remapMqttTlsPortToEmqxRestApiPort('http://h:28083'), 'http://h:28083');
});
