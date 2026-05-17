import { createHash, createHmac } from 'node:crypto';

export function signTencentCloudRequest(input: {
  secretId: string;
  secretKey: string;
  service: string;
  host: string;
  region: string;
  action: string;
  version: string;
  payload: unknown;
}): { headers: Record<string, string>; body: string } {
  const body = JSON.stringify(input.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${input.host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedRequestPayload = sha256Hex(body);
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n');

  const credentialScope = `${date}/${input.service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const secretDate = hmacSha256(`TC3${input.secretKey}`, date);
  const secretService = hmacSha256(secretDate, input.service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256(secretSigning, stringToSign).toString('hex');

  const authorization = [
    'TC3-HMAC-SHA256',
    `Credential=${input.secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    body,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: input.host,
      'X-TC-Action': input.action,
      'X-TC-Version': input.version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': input.region,
    },
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}
