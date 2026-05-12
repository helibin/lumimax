import { getRequiredEnvString } from '@lumimax/config';

import { AESUtil } from './aes.util';

export function encryptTextWithEnvAesKey(input: {
  plaintext: string;
  errorContext?: string;
}): string {
  return AESUtil.encrypt(input.plaintext, resolveEnvAesKey(input.errorContext));
}

export function decryptTextWithEnvAesKey(input: {
  ciphertext: string;
  errorContext?: string;
}): string {
  return AESUtil.decrypt(
    input.ciphertext,
    resolveEnvAesKey(input.errorContext),
  );
}

export function resolveEnvAesKey(errorContext?: string): string {
  const value = getRequiredEnvString('AES_KEY').trim();
  if (!value) {
    throw new Error(
      `AES_KEY is required${errorContext ? ` for ${errorContext}` : ''}`,
    );
  }
  return value;
}
