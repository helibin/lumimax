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
    | 'admin.devices.credential.rotate';
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
  authMode: 'mtls-ca-signed';
  rootCaPem?: string;
};

export function issueEmqxDeviceCertificate(
  input: IssueDeviceCertificateInput,
): DeviceCertificatePayload {
  const endpoint =
    pickString(getEnvString('EMQX_DEVICE_ENDPOINT'))
    ?? pickString(getEnvString('EMQX_BROKER_URL'))
    ?? '127.0.0.1:8883';
  const region = pickString(getEnvString('EMQX_REGION')) ?? 'self-hosted';
  const rootCaPem = resolvePemValue('EMQX_ROOT_CA_PEM', 'EMQX_ROOT_CA_PEM_PATH');
  const rootCaKeyPem = resolvePemValue('EMQX_ROOT_CA_KEY_PEM', 'EMQX_ROOT_CA_KEY_PEM_PATH');

  if (!rootCaPem || !rootCaKeyPem) {
    throw new Error(
      'EMQX device credential provisioning requires both EMQX_ROOT_CA_PEM and EMQX_ROOT_CA_KEY_PEM, or their corresponding *_PATH settings',
    );
  }
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

function resolvePemValue(
  inlineEnvName: 'EMQX_ROOT_CA_KEY_PEM' | 'EMQX_ROOT_CA_PEM',
  pathEnvName: 'EMQX_ROOT_CA_KEY_PEM_PATH' | 'EMQX_ROOT_CA_PEM_PATH',
): string | undefined {
  const inlineValue = normalizePem(getEnvString(inlineEnvName));
  if (inlineValue) {
    return inlineValue;
  }
  const filePath = pickString(getEnvString(pathEnvName));
  if (!filePath) {
    return undefined;
  }
  return normalizePem(fs.readFileSync(filePath, 'utf8'));
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
