import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const AES_ALGO = 'aes-256-cbc';

/**
 * AES utility based on AES-256-CBC.
 * Example: AESUtil.encrypt('hello', keyHex64).
 */
export class AESUtil {
  static encrypt(text: string, key: string): string {
    const keyBuffer = this.toKeyBuffer(key);
    const iv = randomBytes(16);
    const cipher = createCipheriv(AES_ALGO, keyBuffer, iv);
    const encrypted =
      cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  static decrypt(text: string, key: string): string {
    const keyBuffer = this.toKeyBuffer(key);
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid encrypted text format, expected iv:encryptedHex');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(AES_ALGO, keyBuffer, iv);
    return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
  }

  private static toKeyBuffer(key: string): Buffer {
    if (!/^[a-fA-F0-9]{64}$/.test(key)) {
      throw new Error('AES key must be 64 hex characters (32 bytes)');
    }
    return Buffer.from(key, 'hex');
  }
}

