import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AdminEmqxCertSetupService } from './admin-emqx-cert-setup.service';

test('AdminEmqxCertSetupService generates bootstrap cert set and reports ready status', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumimax-emqx-bootstrap-'));
  const previous = snapshotEnv([
    'EMQX_ROOT_CA_PEM_PATH',
    'EMQX_ROOT_CA_KEY_PEM_PATH',
    'EMQX_MQTT_CLIENT_CERT_PEM_PATH',
    'EMQX_MQTT_CLIENT_KEY_PEM_PATH',
    'EMQX_BOOTSTRAP_SERVER_CN',
    'EMQX_BOOTSTRAP_SERVER_SANS',
    'EMQX_MQTT_USERNAME',
  ]);

  try {
    process.env.EMQX_ROOT_CA_PEM_PATH = path.join(tempDir, 'ca.crt');
    process.env.EMQX_ROOT_CA_KEY_PEM_PATH = path.join(tempDir, 'ca.key');
    process.env.EMQX_MQTT_CLIENT_CERT_PEM_PATH = path.join(tempDir, 'iot-service.crt');
    process.env.EMQX_MQTT_CLIENT_KEY_PEM_PATH = path.join(tempDir, 'iot-service.key');
    process.env.EMQX_BOOTSTRAP_SERVER_CN = 'mqtt.example.test';
    process.env.EMQX_BOOTSTRAP_SERVER_SANS = 'DNS:mqtt.example.test,DNS:emqx,IP:127.0.0.1';
    process.env.EMQX_MQTT_USERNAME = 'lumimax_iot';

    const service = new AdminEmqxCertSetupService();
    const before = await service.getStatus();
    assert.equal(before.ready, false);

    const result = await service.setup();
    assert.equal(result.ready, true);
    assert.equal(result.writable, true);
    assert.equal(result.files.every((item) => item.exists), true);

    const second = await service.setup();
    assert.equal(second.ready, true);
    assert.equal(fs.existsSync(path.join(tempDir, 'server.crt')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'server.key')), true);
  } finally {
    restoreEnv(previous);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function snapshotEnv(names: string[]): Record<string, string | undefined> {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[name];
      continue;
    }
    process.env[name] = value;
  }
}
