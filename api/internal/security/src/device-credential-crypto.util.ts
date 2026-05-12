import {
  decryptTextWithEnvAesKey,
  encryptTextWithEnvAesKey,
} from '@lumimax/crypto-utils';

const DEVICE_CREDENTIAL_ENCRYPTION_PREFIX = 'enc:v1:';
const DEVICE_CREDENTIAL_SECRET_KEYS = new Set([
  'certificatePem',
  'privateKey',
  'privateKeyPem',
]);

export function encryptDeviceCredentialSecret(
  value: string | null | undefined,
): string | null | undefined {
  if (!value) {
    return value;
  }
  if (isEncryptedDeviceCredentialSecret(value)) {
    return value;
  }
  return `${DEVICE_CREDENTIAL_ENCRYPTION_PREFIX}${encryptTextWithEnvAesKey({
    plaintext: value,
    errorContext: 'device credential encryption',
  })}`;
}

export function decryptDeviceCredentialSecret(
  value: string | null | undefined,
): string | null | undefined {
  if (!value) {
    return value;
  }
  if (!isEncryptedDeviceCredentialSecret(value)) {
    return value;
  }
  return decryptTextWithEnvAesKey({
    ciphertext: value.slice(DEVICE_CREDENTIAL_ENCRYPTION_PREFIX.length),
    errorContext: 'device credential decryption',
  });
}

export function protectDeviceCredentialPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!payload) {
    return payload;
  }
  const next: Record<string, unknown> = { ...payload };
  for (const key of DEVICE_CREDENTIAL_SECRET_KEYS) {
    const value = next[key];
    if (typeof value === 'string' && value.trim()) {
      next[key] = encryptDeviceCredentialSecret(value);
    }
  }
  return next;
}

export function revealDeviceCredentialPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!payload) {
    return payload;
  }
  const next: Record<string, unknown> = { ...payload };
  for (const key of DEVICE_CREDENTIAL_SECRET_KEYS) {
    const value = next[key];
    if (typeof value === 'string' && value.trim()) {
      next[key] = decryptDeviceCredentialSecret(value);
    }
  }
  return next;
}

export function isEncryptedDeviceCredentialSecret(value: string): boolean {
  return value.startsWith(DEVICE_CREDENTIAL_ENCRYPTION_PREFIX);
}
