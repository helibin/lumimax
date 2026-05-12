export type LoggerLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerRuntimeConfig {
  serviceName: string;
  nodeEnv: string;
  level: LoggerLevel;
  logToConsole: boolean;
  logToFile: boolean;
  logDir: string;
  headerEnabled: boolean;
  bodyEnabled: boolean;
  bodyMaxLength: number;
  maxFiles: string;
  format: 'pretty' | 'json';
  suppressHealthcheck: boolean;
  stackMaxLines: number;
  thirdPartyErrorThrottleMs: number;
}

export const DEFAULT_SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'password',
  'secret',
  'apikey',
  'api-key',
  'appkey',
  'app-key',
  'appsecret',
  'app-secret',
  'privatekey',
  'private-key',
  'certificatepem',
  'certificate-pem',
  'accesskeyid',
  'access-key-id',
  'accesskeysecret',
  'access-key-secret',
  'secretaccesskey',
  'secret-access-key',
  'imagesignedurl',
  'image-signed-url',
];
