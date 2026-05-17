import assert from 'node:assert/strict';
import test from 'node:test';
import { IotEnvelopeService } from '../src/iot/pipeline/iot-envelope.service';

test('iot envelope validates standard protocol payload', () => {
  process.env.DEFAULT_LOCALE = 'zh-CN';
  const service = new IotEnvelopeService();
  const decoded = service.validate({
        meta: {
          requestId: '01h0000000000000000000101a',
          deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ0',
          timestamp: 1777533073006,
          event: 'food.analysis.request',
      version: '1.0',
    },
    data: {
      target: 'tmp-file/device/01habcdefghjkmnpqrstvwxyz0/demo.png',
    },
  });
  assert.equal(decoded.meta.requestId, '01h0000000000000000000101a');
  assert.equal(decoded.meta.deviceId, '01habcdefghjkmnpqrstvwxyz0');
  assert.equal(decoded.meta.event, 'food.analysis.request');
  assert.equal(decoded.meta.locale, 'zh-CN');
});

test('iot envelope accepts flexible protocol version markers', () => {
  process.env.DEFAULT_LOCALE = 'zh-CN';
  const service = new IotEnvelopeService();
  const decodedV12 = service.validate({
    meta: {
      requestId: '01h0000000000000000000101a',
      deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ0',
      timestamp: 1777533073006,
      event: 'food.analysis.request',
      version: '1.2',
    },
    data: {},
  });
  const decodedV1 = service.validate({
    meta: {
      requestId: '01h0000000000000000000101b',
      deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ1',
      timestamp: 1777533073007,
      event: 'food.analysis.request',
      version: 'v1',
    },
    data: {},
  });
  const decodedCustom = service.validate({
    meta: {
      requestId: '01h0000000000000000000101c',
      deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ2',
      timestamp: 1777533073008,
      event: 'food.analysis.request',
      version: '1.x',
    },
    data: {},
  });
  assert.equal(decodedV12.meta.version, '1.2');
  assert.equal(decodedV1.meta.version, 'v1');
  assert.equal(decodedCustom.meta.version, '1.x');
  assert.equal(decodedCustom.meta.locale, 'zh-CN');
});

test('iot envelope uses server default locale when locale is absent', () => {
  process.env.DEFAULT_LOCALE = 'en-US';
  const service = new IotEnvelopeService();
  const decoded = service.validate({
    meta: {
      requestId: '01h0000000000000000000101z',
      deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ9',
      timestamp: 1777533073999,
      event: 'food.analysis.request',
      version: '1.0',
    },
    data: {},
  });
  assert.equal(decoded.meta.locale, 'en-US');
});

test('iot envelope accepts explicit locale and falls back from legacy lang', () => {
  const service = new IotEnvelopeService();
  const decoded = service.validate({
    meta: {
      requestId: '01h0000000000000000000101d',
      deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ3',
      timestamp: 1777533073009,
      event: 'upload.token.request',
      version: '1.0',
      locale: 'en-US',
    },
    data: {},
  });
  assert.equal(decoded.meta.locale, 'en-US');
});

test('iot envelope rejects invalid event', () => {
  const service = new IotEnvelopeService();
  assert.throws(
    () =>
      service.validate({
        meta: {
          requestId: '01h0000000000000000000101a',
          deviceId: '01HABCDEFGHJKMNPQRSTVWXYZ0',
          timestamp: 1777533073006,
          event: 'INVALID_EVENT',
          version: '1.0',
        },
        data: {},
      }),
    /非法的 IoT event/,
  );
});

test('iot envelope accepts uuid requestId for compatibility', () => {
  const service = new IotEnvelopeService();
  const decoded = service.validate({
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440001',
      deviceId: 'device-compat-01',
      timestamp: 1777533073006,
      event: 'food.analysis.request',
      version: '1.0',
    },
    data: {},
  });
  assert.equal(decoded.meta.requestId, '550e8400-e29b-41d4-a716-446655440001');
});

test('iot envelope accepts arbitrary requestId within 36 chars', () => {
  const service = new IotEnvelopeService();
  const decoded = service.validate({
    meta: {
      requestId: '00236jvq0wgn7c4p8r2t5x9y1mn30',
      deviceId: 'device-compat-02',
      timestamp: 1777533073006,
      event: 'food.analysis.request',
      version: '1.0',
    },
    data: {},
  });
  assert.equal(decoded.meta.requestId, '00236jvq0wgn7c4p8r2t5x9y1mn30');
});

test('iot envelope rejects requestId longer than 36 chars', () => {
  const service = new IotEnvelopeService();
  assert.throws(
    () =>
      service.validate({
        meta: {
          requestId: '1234567890123456789012345678901234567',
          deviceId: 'device-compat-03',
          timestamp: 1777533073006,
          event: 'food.analysis.request',
          version: '1.0',
        },
        data: {},
      }),
    /长度不能超过 36 位/,
  );
});
