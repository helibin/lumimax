import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getEnvString } from '@lumimax/config';

type IssueDeviceCertificateInput = {
  deviceId: string;
  deviceSn: string;
  productKey: string;
  requestId: string;
  trigger:
    | 'admin.devices.create'
    | 'devices.create'
    | 'admin.devices.provision'
    | 'admin.devices.certificate.rotate';
};

type DeviceCertificatePayload = {
  accepted: true;
  trigger: IssueDeviceCertificateInput['trigger'];
  status: 'active';
  vendor: 'emqx';
  mode: 'sync-created';
  requestedAt: string;
  credentialId: string;
  certificatePem: string;
  privateKey: string;
  thingName: string;
  endpoint: string;
  region: string;
  fingerprint: string;
  productKey: string;
  authMode: 'mtls-ca-signed' | 'mtls-self-signed';
  rootCaPem?: string;
};

export function issueEmqxDeviceCertificate(
  input: IssueDeviceCertificateInput,
): DeviceCertificatePayload {
  const endpoint = pickString(getEnvString('IOT_ENDPOINT')) ?? '127.0.0.1:8883';
  const region = pickString(getEnvString('IOT_REGION')) ?? 'self-hosted';
  const rootCaPem = normalizePem(getEnvString('IOT_ROOT_CA_PEM'));
  const rootCaKeyPem = normalizePem(getEnvString('IOT_ROOT_CA_KEY_PEM'));

  if (rootCaPem && rootCaKeyPem) {
    const issued = issueCaSignedClientCertificate({
      deviceId: input.deviceId,
      deviceSn: input.deviceSn,
      rootCaPem,
      rootCaKeyPem,
    });
    return {
      accepted: true,
      trigger: input.trigger,
      status: 'active',
      vendor: 'emqx',
      mode: 'sync-created',
      requestedAt: new Date().toISOString(),
      credentialId: `${input.deviceId}:${issued.fingerprint}`,
      certificatePem: issued.certificatePem,
      privateKey: issued.privateKeyPem,
      thingName: input.deviceId,
      endpoint,
      region,
      fingerprint: issued.fingerprint,
      productKey: input.productKey,
      authMode: 'mtls-ca-signed',
      rootCaPem,
    };
  }

  const selfSigned = issueSelfSignedClientCertificate({
    deviceId: input.deviceId,
    deviceSn: input.deviceSn,
  });
  return {
    accepted: true,
    trigger: input.trigger,
    status: 'active',
    vendor: 'emqx',
    mode: 'sync-created',
    requestedAt: new Date().toISOString(),
    credentialId: `${input.deviceId}:${selfSigned.fingerprint}`,
    certificatePem: selfSigned.certificatePem,
    privateKey: selfSigned.privateKeyPem,
    thingName: input.deviceId,
    endpoint,
    region,
    fingerprint: selfSigned.fingerprint,
    productKey: input.productKey,
    authMode: 'mtls-self-signed',
    rootCaPem: selfSigned.certificatePem,
  };
}

function issueCaSignedClientCertificate(input: {
  deviceId: string;
  deviceSn: string;
  rootCaPem: string;
  rootCaKeyPem: string;
}): {
  certificatePem: string;
  privateKeyPem: string;
  fingerprint: string;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumimax-emqx-ca-'));
  try {
    const caCertPath = path.join(tempDir, 'ca-cert.pem');
    const caKeyPath = path.join(tempDir, 'ca-key.pem');
    const clientKeyPath = path.join(tempDir, 'client-key.pem');
    const clientCsrPath = path.join(tempDir, 'client.csr');
    const clientCertPath = path.join(tempDir, 'client-cert.pem');
    const extPath = path.join(tempDir, 'client-ext.cnf');

    fs.writeFileSync(caCertPath, ensureTrailingNewline(input.rootCaPem), 'utf8');
    fs.writeFileSync(caKeyPath, ensureTrailingNewline(input.rootCaKeyPem), 'utf8');
    fs.writeFileSync(
      extPath,
      ['basicConstraints=CA:FALSE', 'keyUsage=digitalSignature,keyEncipherment', 'extendedKeyUsage=clientAuth', 'subjectAltName=DNS:device.local'].join('\n'),
      'utf8',
    );

    runOpenSsl([
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      clientKeyPath,
      '-out',
      clientCsrPath,
      '-subj',
      buildDeviceSubject(input.deviceId, input.deviceSn),
    ]);
    runOpenSsl([
      'x509',
      '-req',
      '-in',
      clientCsrPath,
      '-CA',
      caCertPath,
      '-CAkey',
      caKeyPath,
      '-CAcreateserial',
      '-out',
      clientCertPath,
      '-days',
      '3650',
      '-sha256',
      '-extfile',
      extPath,
    ]);

    const certificatePem = fs.readFileSync(clientCertPath, 'utf8');
    const privateKeyPem = fs.readFileSync(clientKeyPath, 'utf8');
    return {
      certificatePem,
      privateKeyPem,
      fingerprint: buildFingerprint(certificatePem),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function issueSelfSignedClientCertificate(input: {
  deviceId: string;
  deviceSn: string;
}): {
  certificatePem: string;
  privateKeyPem: string;
  fingerprint: string;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumimax-emqx-self-'));
  try {
    const clientKeyPath = path.join(tempDir, 'client-key.pem');
    const clientCertPath = path.join(tempDir, 'client-cert.pem');
    const extPath = path.join(tempDir, 'client-ext.cnf');

    fs.writeFileSync(
      extPath,
      ['basicConstraints=CA:FALSE', 'keyUsage=digitalSignature,keyEncipherment', 'extendedKeyUsage=clientAuth', 'subjectAltName=DNS:device.local'].join('\n'),
      'utf8',
    );

    runOpenSsl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      clientKeyPath,
      '-out',
      clientCertPath,
      '-days',
      '3650',
      '-sha256',
      '-subj',
      buildDeviceSubject(input.deviceId, input.deviceSn),
      '-extensions',
      'v3_req',
      '-config',
      buildInlineOpenSslConfigPath(tempDir),
    ]);

    const certificatePem = fs.readFileSync(clientCertPath, 'utf8');
    const privateKeyPem = fs.readFileSync(clientKeyPath, 'utf8');
    return {
      certificatePem,
      privateKeyPem,
      fingerprint: buildFingerprint(certificatePem),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildInlineOpenSslConfigPath(tempDir: string): string {
  const configPath = path.join(tempDir, 'openssl.cnf');
  fs.writeFileSync(
    configPath,
    [
      '[req]',
      'distinguished_name=req_distinguished_name',
      'x509_extensions=v3_req',
      'prompt=no',
      '[req_distinguished_name]',
      'CN=device.local',
      '[v3_req]',
      'basicConstraints=CA:FALSE',
      'keyUsage=digitalSignature,keyEncipherment',
      'extendedKeyUsage=clientAuth',
      'subjectAltName=DNS:device.local',
    ].join('\n'),
    'utf8',
  );
  return configPath;
}

function runOpenSsl(args: string[]): void {
  execFileSync('openssl', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function buildDeviceSubject(deviceId: string, deviceSn: string): string {
  const commonName = sanitizeSubjectValue(deviceId || deviceSn || 'device');
  const orgUnit = sanitizeSubjectValue(deviceSn || deviceId || 'device');
  return `/CN=${commonName}/OU=${orgUnit}/O=Lumimax`;
}

function sanitizeSubjectValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 64) || 'device';
}

function normalizePem(value: string | undefined): string | undefined {
  const normalized = pickString(value)?.replace(/\\n/g, '\n');
  return normalized ? ensureTrailingNewline(normalized) : undefined;
}

function pickString(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function buildFingerprint(certificatePem: string): string {
  const x509 = new crypto.X509Certificate(certificatePem);
  return crypto.createHash('sha256').update(x509.raw).digest('hex');
}
