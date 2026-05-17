import * as os from 'node:os';
import { EventEmitter, once } from 'node:events';
import crypto from 'node:crypto';
import { Agent } from 'undici';
import { getEnvString } from '@lumimax/config';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppLogger, formatErrorMessageForLog } from '@lumimax/logger';
import type { MqttClient } from 'mqtt';
import type {
  IotProvider,
  PublishConnectionFeedbackInput,
  PublishMessage,
} from '../../interfaces/iot-provider.interface';
import { LUMIMAX_BROKER_DOWNLINK_CLIENT_ID_PREFIX } from './emqx-broker-downlink.constants';
import {
  pickString,
  resolveEmqxBrokerUrl,
  resolveEmqxRestBaseUrl,
  resolvePemValue,
} from '../provider-publish.util';

const mqtt = require('mqtt') as typeof import('mqtt');

const RECONNECT_PERIOD_MS = 5000;
const INITIAL_CONNECT_WAIT_MS = 20_000;
const PUBLISH_ONLINE_WAIT_MS = 25_000;

type RestTlsDispatcherState =
  | { kind: 'unset' }
  | { kind: 'default' }
  | { kind: 'agent'; agent: Agent };

@Injectable()
export class EmqxProviderService implements IotProvider, OnModuleDestroy {
  readonly vendor = 'emqx' as const;

  private client: MqttClient | null = null;
  private clientBootstrap: Promise<void> | null = null;
  private readonly stableClientId = resolveBrokerClientId();
  private handlersBound = false;
  private restTlsDispatcher: RestTlsDispatcherState = { kind: 'unset' };

  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  async onModuleDestroy(): Promise<void> {
    const c = this.client;
    this.client = null;
    this.clientBootstrap = null;
    this.handlersBound = false;
    if (c) {
      c.removeAllListeners();
      await new Promise<void>((resolve) => {
        c.end(false, {}, () => resolve());
      });
    }
    if (this.restTlsDispatcher.kind === 'agent') {
      void this.restTlsDispatcher.agent.close();
      this.restTlsDispatcher = { kind: 'unset' };
    }
  }

  async publish(input: PublishMessage): Promise<void> {
    const mode = resolveEmqxPublishMode();
    const endpoint = getEnvString('EMQX_BROKER_URL', '') ?? '';
    const restBaseUrl = resolveEmqxRestBaseUrl(
      getEnvString('EMQX_HTTP_BASE_URL', '') || endpoint,
    );
    const brokerUrl = resolveEmqxBrokerUrl(endpoint);
    const target = mode === 'http' ? restBaseUrl : brokerUrl;
    if (!target) {
      this.logger.warn(
        '未配置 EMQX_BROKER_URL，跳过 EMQX 下行发布',
        {
          requestId: input.requestId,
          idLabel: 'ReqId',
        },
        EmqxProviderService.name,
      );
      return;
    }

    if (mode === 'http') {
      await this.publishViaRest(restBaseUrl, input);
      return;
    }
    const client = await this.acquireOnlineClient(brokerUrl, input.requestId);
    const payload = JSON.stringify(input.payload);
    const qos = input.qos ?? 1;
    await this.publishWithCallback(client, input.topic, payload, qos, input.requestId);
  }

  async publishConnectionFeedback(
    input: PublishConnectionFeedbackInput,
  ): Promise<boolean> {
    await this.publish(input);
    return true;
  }

  private async acquireOnlineClient(brokerUrl: string, requestId: string): Promise<MqttClient> {
    if (!this.client) {
      this.clientBootstrap ??= this.bootstrapFirstClient(brokerUrl).finally(() => {
        this.clientBootstrap = null;
      });
      await this.clientBootstrap;
    }
    if (!this.client) {
      throw new Error('EMQX MQTT client is not initialised');
    }
    if (!this.client.connected) {
      await this.waitUntilConnected(this.client, PUBLISH_ONLINE_WAIT_MS, requestId);
    }
    return this.client;
  }

  private async bootstrapFirstClient(brokerUrl: string): Promise<void> {
    try {
      const username = pickString(getEnvString('EMQX_MQTT_USERNAME'));
      const password = pickString(getEnvString('EMQX_MQTT_PASSWORD'));
      const cert = resolvePemValue('EMQX_MQTT_CLIENT_CERT_PEM', 'EMQX_MQTT_CLIENT_CERT_PEM_PATH');
      const key = resolvePemValue('EMQX_MQTT_CLIENT_KEY_PEM', 'EMQX_MQTT_CLIENT_KEY_PEM_PATH');
      const ca = resolvePemValue('EMQX_ROOT_CA_PEM', 'EMQX_ROOT_CA_PEM_PATH');

      this.client = mqtt.connect(brokerUrl, {
        clientId: this.stableClientId,
        username,
        password,
        cert: cert ? Buffer.from(cert, 'utf8') : undefined,
        key: key ? Buffer.from(key, 'utf8') : undefined,
        ca: ca ? Buffer.from(ca, 'utf8') : undefined,
        protocolVersion: 5,
        clean: true,
        keepalive: pickKeepaliveSeconds(),
        connectTimeout: 15_000,
        reconnectPeriod: RECONNECT_PERIOD_MS,
        rejectUnauthorized: Boolean(ca),
      });

      this.bindClientLifecycleEvents();
      await this.waitUntilConnected(this.client, INITIAL_CONNECT_WAIT_MS, undefined);
    } catch (error) {
      this.hardResetClient();
      throw error;
    }
  }

  private bindClientLifecycleEvents(): void {
    const c = this.client;
    if (!c || this.handlersBound) {
      return;
    }
    this.handlersBound = true;
    c.on('error', (err: Error) => {
      this.logger.warn(
        'EMQX MQTT client error（库会自动重连时可忽略单次错误）',
        { message: err.message, clientId: this.stableClientId },
        EmqxProviderService.name,
      );
    });
    c.on('close', () => {
      this.logger.debug(
        'EMQX MQTT 连接关闭',
        { clientId: this.stableClientId },
        EmqxProviderService.name,
      );
    });
    c.on('reconnect', () => {
      this.logger.debug(
        'EMQX MQTT 正在重连',
        { clientId: this.stableClientId },
        EmqxProviderService.name,
      );
    });
    c.on('offline', () => {
      this.logger.debug(
        'EMQX MQTT client offline',
        { clientId: this.stableClientId },
        EmqxProviderService.name,
      );
    });
  }

  private async waitUntilConnected(
    client: MqttClient,
    deadlineMs: number,
    requestId: string | undefined,
  ): Promise<void> {
    if (client.connected) {
      return;
    }
    try {
      await Promise.race([
        once(client as unknown as EventEmitter, 'connect'),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`EMQX MQTT connect timeout after ${deadlineMs}ms`)), deadlineMs);
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        'EMQX MQTT 等待在线超时或失败',
        {
          requestId,
          idLabel: 'ReqId',
          message: error instanceof Error ? error.message : String(error),
          clientId: this.stableClientId,
        },
        EmqxProviderService.name,
      );
      throw error;
    }
  }

  private async publishWithCallback(
    client: MqttClient,
    topic: string,
    payload: string,
    qos: number,
    requestId: string,
  ): Promise<void> {
    if (!client.connected) {
      await this.waitUntilConnected(client, PUBLISH_ONLINE_WAIT_MS, requestId);
    }
    const qosLevel: 0 | 1 = qos >= 1 ? 1 : 0;
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, payload, { qos: qosLevel }, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  private hardResetClient(): void {
    const c = this.client;
    this.client = null;
    this.handlersBound = false;
    if (c) {
      try {
        c.removeAllListeners();
        c.end(true);
      } catch {
        /* ignore */
      }
    }
  }

  private resolveEmqxRestFetchDispatcher(): Agent | undefined {
    if (this.restTlsDispatcher.kind !== 'unset') {
      return this.restTlsDispatcher.kind === 'agent' ? this.restTlsDispatcher.agent : undefined;
    }
    const insecure = pickString(getEnvString('EMQX_HTTP_TLS_INSECURE')) === 'true';
    const ca = resolvePemValue('EMQX_ROOT_CA_PEM', 'EMQX_ROOT_CA_PEM_PATH');
    if (insecure) {
      const agent = new Agent({ connect: { rejectUnauthorized: false } });
      this.restTlsDispatcher = { kind: 'agent', agent };
      return agent;
    }
    if (ca) {
      const agent = new Agent({
        connect: {
          ca: Buffer.from(ca, 'utf8'),
          rejectUnauthorized: true,
        },
      });
      this.restTlsDispatcher = { kind: 'agent', agent };
      return agent;
    }
    this.restTlsDispatcher = { kind: 'default' };
    return undefined;
  }

  private async publishViaRest(baseUrl: string, input: PublishMessage): Promise<void> {
    const username = pickString(getEnvString('IOT_ACCESS_KEY_ID'));
    const password = pickString(getEnvString('IOT_ACCESS_KEY_SECRET'));
    if (!username || !password) {
      throw new Error('EMQX REST publish requires IOT_ACCESS_KEY_ID/IOT_ACCESS_KEY_SECRET');
    }

    const publishUrl = `${baseUrl}/api/v5/publish`;
    try {
      const dispatcher = this.resolveEmqxRestFetchDispatcher();
      const response = await fetch(publishUrl, {
        ...(dispatcher ? { dispatcher } : {}),
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        },
        body: JSON.stringify({
          topic: input.topic,
          qos: input.qos ?? 1,
          retain: false,
          payload: Buffer.from(JSON.stringify(input.payload), 'utf8').toString('base64'),
          payload_encoding: 'base64',
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`EMQX REST publish failed: ${response.status} ${text.slice(0, 200)}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('EMQX REST publish failed:')) {
        throw error;
      }
      const inner = error instanceof Error ? error : new Error(String(error));
      throw new Error(`EMQX REST ${publishUrl}: ${formatErrorMessageForLog(inner)}`, { cause: inner });
    }
  }
}

function pickKeepaliveSeconds(): number {
  const raw = getEnvString('EMQX_MQTT_KEEPALIVE', '')?.trim();
  if (!raw) {
    return 60;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 10 || n > 3600) {
    return 60;
  }
  return Math.floor(n);
}

/**
 * 稳定 clientId：同一进程内复用，便于 EMQX 会话与 HTTP 鉴权规则（lumimax-biz-*）一致。
 * 集群内默认使用 hostname + pid + random suffix 保证唯一，无需额外配置 env。
 */
function resolveBrokerClientId(): string {
  const suffix = `${sanitizeHost(os.hostname())}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  return `${LUMIMAX_BROKER_DOWNLINK_CLIENT_ID_PREFIX}${suffix}`.slice(0, 200);
}

function sanitizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return trimmed.length > 0 ? trimmed.slice(0, 48) : 'host';
}

function resolveEmqxPublishMode(): 'mqtt' | 'http' {
  return pickString(getEnvString('EMQX_PUBLISH_MODE')) === 'mqtt' ? 'mqtt' : 'http';
}
