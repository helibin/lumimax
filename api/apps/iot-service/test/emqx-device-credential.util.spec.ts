import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { issueEmqxDeviceCertificate } from '../src/provisioning/emqx-device-certificate.util';

test('issueEmqxDeviceCertificate supports CA material from file paths', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumimax-emqx-cert-spec-'));
  const caKeyPath = path.join(tempDir, 'ca.key');
  const caCertPath = path.join(tempDir, 'ca.crt');

  const previousVendor = process.env.IOT_VENDOR;
  const previousEndpoint = process.env.EMQX_BROKER_URL;
  const previousRegion = process.env.EMQX_REGION;
  const previousCaPem = process.env.EMQX_ROOT_CA_PEM;
  const previousCaKeyPem = process.env.EMQX_ROOT_CA_KEY_PEM;
  const previousCaPemPath = process.env.EMQX_ROOT_CA_PEM_PATH;
  const previousCaKeyPemPath = process.env.EMQX_ROOT_CA_KEY_PEM_PATH;

  try {
    execFileSync('openssl', ['genrsa', '-out', caKeyPath, '2048'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-new',
        '-nodes',
        '-key',
        caKeyPath,
        '-sha256',
        '-days',
        '3650',
        '-out',
        caCertPath,
        '-subj',
        '/CN=Lumimax Test Root CA/O=Lumimax',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    process.env.IOT_VENDOR = 'emqx';
    process.env.EMQX_BROKER_URL = '127.0.0.1:8883';
    process.env.EMQX_REGION = 'self-hosted';
    delete process.env.EMQX_ROOT_CA_PEM;
    delete process.env.EMQX_ROOT_CA_KEY_PEM;
    process.env.EMQX_ROOT_CA_PEM_PATH = caCertPath;
    process.env.EMQX_ROOT_CA_KEY_PEM_PATH = caKeyPath;

    const result = issueEmqxDeviceCertificate({
      deviceId: 'device-emqx-spec-1',
      deviceSn: 'SN-EMQX-SPEC-1',
      productKey: 'pk-emqx-spec-1',
      requestId: 'req-emqx-spec-1',
      trigger: 'admin.devices.create',
    });

    assert.equal(result.vendor, 'emqx');
    assert.equal(result.authMode, 'mtls-ca-signed');
    assert.equal(result.endpoint, '127.0.0.1:8883');
    assert.equal(result.region, 'self-hosted');
    assert.match(result.certificatePem, /BEGIN CERTIFICATE/);
    assert.match(result.privateKey, /BEGIN PRIVATE KEY/);
    assert.equal(result.rootCaPem, fs.readFileSync(caCertPath, 'utf8'));
  } finally {
    restoreEnv('IOT_VENDOR', previousVendor);
    restoreEnv('EMQX_BROKER_URL', previousEndpoint);
    restoreEnv('EMQX_REGION', previousRegion);
    restoreEnv('EMQX_ROOT_CA_PEM', previousCaPem);
    restoreEnv('EMQX_ROOT_CA_KEY_PEM', previousCaKeyPem);
    restoreEnv('EMQX_ROOT_CA_PEM_PATH', previousCaPemPath);
    restoreEnv('EMQX_ROOT_CA_KEY_PEM_PATH', previousCaKeyPemPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
