import { createHash, createHmac } from 'node:crypto';

/**
 * Hash utility.
 * Example: HashUtil.sha256('payload').
 */
export class HashUtil {
  static sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  static md5(data: string): string {
    return createHash('md5').update(data, 'utf8').digest('hex');
  }

  static hmac(data: string, secret: string): string {
    return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
  }
}

