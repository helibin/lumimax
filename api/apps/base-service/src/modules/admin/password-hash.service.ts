import { Injectable } from '@nestjs/common';
import { scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const { compare, hash } = require('bcryptjs') as {
  compare: (plain: string, digest: string) => Promise<boolean>;
  hash: (plain: string, rounds: number) => Promise<string>;
};
const scrypt = promisify(nodeScrypt);
const BCRYPT_ROUNDS = 12;
const MD5_HEX_REGEX = /^[a-f0-9]{32}$/i;

@Injectable()
export class PasswordHashService {
  async hashClientPasswordMd5(passwordMd5: string, subjectId: string): Promise<string> {
    return hash(this.mixClientPasswordMd5(passwordMd5, subjectId), BCRYPT_ROUNDS);
  }

  async verifyClientPasswordMd5(
    passwordMd5: string,
    passwordHash: string,
    subjectId: string,
  ): Promise<boolean> {
    const normalizedPasswordMd5 = this.normalizeClientPasswordMd5(passwordMd5);
    const mixedPassword = this.mixClientPasswordMd5(normalizedPasswordMd5, subjectId);
    if (this.isBcryptHash(passwordHash)) {
      if (await compare(mixedPassword, passwordHash)) {
        return true;
      }
      return compare(normalizedPasswordMd5, passwordHash);
    }
    if (await this.verifyLegacyScrypt(mixedPassword, passwordHash)) {
      return true;
    }
    return this.verifyLegacyScrypt(normalizedPasswordMd5, passwordHash);
  }

  private isBcryptHash(passwordHash: string): boolean {
    return (
      passwordHash.startsWith('$2a$')
      || passwordHash.startsWith('$2b$')
      || passwordHash.startsWith('$2y$')
    );
  }

  private async verifyLegacyScrypt(password: string, passwordHash: string): Promise<boolean> {
    const [scheme, salt, stored] = passwordHash.split('$');
    if (scheme !== 'scrypt' || !salt || !stored) {
      return false;
    }
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(stored, 'hex');
    if (derived.length !== storedBuffer.length) {
      return false;
    }
    return timingSafeEqual(derived, storedBuffer);
  }

  private normalizeClientPasswordMd5(passwordMd5: string): string {
    const normalized = passwordMd5.trim().toLowerCase();
    if (!MD5_HEX_REGEX.test(normalized)) {
      throw new Error('password must be a 32-character md5 hex string');
    }
    return normalized;
  }

  private mixClientPasswordMd5(passwordMd5: string, subjectId: string): string {
    return `${subjectId}:${this.normalizeClientPasswordMd5(passwordMd5)}`;
  }
}
