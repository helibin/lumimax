import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveConfiguredIotReceiveMode,
  shouldRejectEmqxHttpStyleUplinkIngest,
} from './iot-receive-mode.util';

test('resolveConfiguredIotReceiveMode defaults to mq and accepts callback alias', () => {
  const prevReceiveMode = process.env.IOT_RECEIVE_MODE;
  try {
    delete process.env.IOT_RECEIVE_MODE;
    assert.equal(resolveConfiguredIotReceiveMode(), 'mq');
    process.env.IOT_RECEIVE_MODE = 'CALLBACK';
    assert.equal(resolveConfiguredIotReceiveMode(), 'callback');
  } finally {
    restoreEnv('IOT_RECEIVE_MODE', prevReceiveMode);
  }
});

test('shouldRejectEmqxHttpStyleUplinkIngest is true only for emqx vendor with mq mode', () => {
  const prevReceiveMode = process.env.IOT_RECEIVE_MODE;
  const prevVendor = process.env.IOT_VENDOR;
  try {
    process.env.IOT_VENDOR = 'emqx';
    process.env.IOT_RECEIVE_MODE = 'mq';
    assert.equal(shouldRejectEmqxHttpStyleUplinkIngest(), true);
    process.env.IOT_RECEIVE_MODE = 'callback';
    assert.equal(shouldRejectEmqxHttpStyleUplinkIngest(), false);
    process.env.IOT_VENDOR = 'aws';
    process.env.IOT_RECEIVE_MODE = 'mq';
    assert.equal(shouldRejectEmqxHttpStyleUplinkIngest(), false);
  } finally {
    restoreEnv('IOT_RECEIVE_MODE', prevReceiveMode);
    restoreEnv('IOT_VENDOR', prevVendor);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
