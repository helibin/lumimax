import fs from 'node:fs';
import { getEnvString } from '@lumimax/config';

export function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function resolveEmqxBrokerUrl(value: string): string {
  const endpoint = value.trim().replace(/\/+$/g, '');
  if (!endpoint) {
    return '';
  }
  if (
    endpoint.startsWith('mqtt://')
    || endpoint.startsWith('mqtts://')
    || endpoint.startsWith('ws://')
    || endpoint.startsWith('wss://')
  ) {
    return endpoint;
  }
  const hasPort = /:\d+$/.test(endpoint);
  return `mqtts://${endpoint}${hasPort ? '' : ':8883'}`;
}

export function resolveEmqxRestBaseUrl(value: string): string {
  const endpoint = value.trim().replace(/\/+$/g, '');
  if (!endpoint) {
    return '';
  }
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  if (endpoint.startsWith('mqtt://')) {
    return remapMqttTlsPortToEmqxRestApiPort(`http://${endpoint.slice('mqtt://'.length)}`);
  }
  if (endpoint.startsWith('mqtts://')) {
    return remapMqttTlsPortToEmqxRestApiPort(`http://${endpoint.slice('mqtts://'.length)}`);
  }
  return remapMqttTlsPortToEmqxRestApiPort(`http://${endpoint}`);
}

/**
 * EMQX HTTP API 默认监听 18083（明文 HTTP）；HTTPS 通常在 18084。
 * `EMQX_BROKER_URL` 常为 MQTTS 8883，需映射到 18083，且不可误用 https 访问明文端口。
 */
export function remapMqttTlsPortToEmqxRestApiPort(url: string): string {
  try {
    const u = new URL(url);
    if (u.port === '8883') {
      u.port = '18083';
    }
    if (!u.port) {
      u.port = '18083';
    }
    if (u.port === '18083' && u.protocol === 'https:') {
      u.protocol = 'http:';
    }
    return u.origin;
  } catch {
    return url;
  }
}

export function resolvePemValue(
  inlineEnvName:
    | 'EMQX_MQTT_CLIENT_CERT_PEM'
    | 'EMQX_MQTT_CLIENT_KEY_PEM'
    | 'EMQX_ROOT_CA_PEM',
  pathEnvName:
    | 'EMQX_MQTT_CLIENT_CERT_PEM_PATH'
    | 'EMQX_MQTT_CLIENT_KEY_PEM_PATH'
    | 'EMQX_ROOT_CA_PEM_PATH',
): string | undefined {
  const inlineValue = decodePem(getEnvString(inlineEnvName));
  if (inlineValue) {
    return inlineValue;
  }
  const filePath = pickString(getEnvString(pathEnvName));
  if (!filePath) {
    return undefined;
  }
  return decodePem(fs.readFileSync(filePath, 'utf8'));
}

function decodePem(value: string | undefined): string | undefined {
  const normalized = pickString(value)?.replace(/\\n/g, '\n');
  return normalized ? normalized.endsWith('\n') ? normalized : `${normalized}\n` : undefined;
}
