import { gzipSync } from 'node:zlib';

type ArchiveEntry = {
  name: string;
  content: string;
  mode?: number;
  mtime?: Date;
};

export function buildDeviceCertificatePackage(input: {
  deviceSn: string;
  thingName?: string | null;
  vendor?: string | null;
  endpoint?: string | null;
  region?: string | null;
  productKey?: string | null;
  credentialId?: string | null;
  certificatePem?: string | null;
  privateKeyPem?: string | null;
  deviceSecret?: string | null;
  rootCaPem?: string | null;
}): {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  size: number;
} {
  const baseName = sanitizeFileName(input.deviceSn || 'device');
  const issuedAt = new Date();
  const entries: ArchiveEntry[] = [
    {
      name: `${baseName}-README.txt`,
      content: [
        `deviceSn=${input.deviceSn}`,
        `thingName=${input.thingName ?? ''}`,
        `vendor=${input.vendor ?? ''}`,
        `endpoint=${input.endpoint ?? ''}`,
        `region=${input.region ?? ''}`,
        `generatedAt=${issuedAt.toISOString()}`,
      ].join('\n'),
    },
  ];

  if (input.certificatePem) {
    entries.push({
      name: `${baseName}-certificate.pem`,
      content: ensureTrailingNewline(input.certificatePem),
    });
  }
  if (input.privateKeyPem) {
    entries.push({
      name: `${baseName}-private-key.pem`,
      content: ensureTrailingNewline(input.privateKeyPem),
    });
  }
  entries.push({
    name: input.vendor === 'emqx' ? `${baseName}-ca.pem` : 'AmazonRootCA1.pem',
    content: ensureTrailingNewline(
      input.rootCaPem ?? (input.vendor === 'emqx' ? '' : DEFAULT_AWS_IOT_ROOT_CA_PEM),
    ),
  });

  const tarBuffer = createTarArchive(entries);
  const gzipBuffer = gzipSync(tarBuffer);
  return {
    fileName:
      input.vendor === 'emqx'
        ? `${baseName}-emqx-credential-package.tar.gz`
        : `${baseName}-credential-package.tar.gz`,
    mimeType: 'application/gzip',
    contentBase64: gzipBuffer.toString('base64'),
    size: gzipBuffer.length,
  };
}

export function getDefaultAwsIotRootCaPem(): string {
  return DEFAULT_AWS_IOT_ROOT_CA_PEM;
}

function createTarArchive(entries: ArchiveEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const contentBuffer = Buffer.from(entry.content, 'utf8');
    const header = createTarHeader({
      name: entry.name,
      size: contentBuffer.length,
      mode: entry.mode ?? 0o644,
      mtime: Math.floor((entry.mtime ?? new Date()).getTime() / 1000),
    });
    blocks.push(header);
    blocks.push(contentBuffer);
    const padding = (512 - (contentBuffer.length % 512)) % 512;
    if (padding > 0) {
      blocks.push(Buffer.alloc(padding));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function createTarHeader(input: {
  name: string;
  size: number;
  mode: number;
  mtime: number;
}): Buffer {
  const header = Buffer.alloc(512, 0);
  writeString(header, 0, 100, input.name);
  writeOctal(header, 100, 8, input.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, input.size);
  writeOctal(header, 136, 12, input.mtime);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeOctal(header, 148, 8, checksum);
  return header;
}

function writeString(buffer: Buffer, offset: number, length: number, value: string): void {
  const source = Buffer.from(value, 'utf8');
  source.copy(buffer, offset, 0, Math.min(source.length, length));
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const octal = value.toString(8).padStart(length - 1, '0');
  writeString(buffer, offset, length - 1, octal);
  buffer[offset + length - 1] = 0;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'device';
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

const DEFAULT_AWS_IOT_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv
o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU
5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy
rqXRfboQnoZsG4q5WTP468SQvvG5
-----END CERTIFICATE-----`;
