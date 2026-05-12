import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { IotController } from '../src/iot/bridge/iot.controller';

test('iot controller rejects internal mqtt request with invalid shared secret', () => {
  let called = false;
  const controller = new IotController(
    {
      authorize() {
        throw new UnauthorizedException('invalid internal mqtt credentials');
      },
    } as never,
    {
      async authenticate() {
        called = true;
        return { result: 'allow' };
      },
    } as never,
  );

  assert.throws(
    () => controller.authenticate({ authorization: 'Bearer wrong' }, { clientid: 'device-1' }),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === 'invalid internal mqtt credentials',
  );
  assert.equal(called, false);
});

test('iot controller forwards request after internal mqtt auth succeeds', async () => {
  let called = false;
  const controller = new IotController(
    {
      authorize() {
        return;
      },
    } as never,
    {
      async webhook(body: Record<string, unknown>) {
        called = true;
        assert.equal(body.event, 'message.publish');
        return { ok: true };
      },
    } as never,
  );

  const result = await controller.webhook(
    { authorization: 'Bearer okay' },
    { event: 'message.publish' },
  );
  assert.equal(called, true);
  assert.deepEqual(result, { ok: true });
});
