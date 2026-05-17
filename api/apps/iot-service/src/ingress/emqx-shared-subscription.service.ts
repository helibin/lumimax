import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import {
  getEnvString,
  resolveConfiguredIotReceiveMode,
  resolveConfiguredIotVendor,
} from '@lumimax/config';
import {
  EmqxIngressAdapterService,
  pickString,
  resolveEmqxBrokerUrl,
  resolvePemValue,
} from '@lumimax/iot-kit';
import { AppLogger } from '@lumimax/logger';
import type { ISubscriptionMap, MqttClient } from 'mqtt';
import { once } from 'node:events';
import { generateId } from '@lumimax/runtime';
import {
  IOT_BRIDGE_UPSTREAM_EVENT,
  resolveIotBridgeEventPattern,
  type IotBridgeUplinkMessage,
} from '../transport/iot-bridge.rabbitmq';
import { IotUplinkBridgeService } from '../transport/iot-uplink-bridge.service';

const mqtt = require('mqtt') as typeof import('mqtt');

const CONNECT_TIMEOUT_MS = 20_000;
const RECONNECT_PERIOD_MS = 5_000;

@Injectable()
export class EmqxSharedSubscriptionService implements OnModuleInit, OnApplicationShutdown {
  private client: MqttClient | null = null;
  private stopping = false;

  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(EmqxIngressAdapterService)
    private readonly emqxIngressAdapterService: EmqxIngressAdapterService,
    @Inject(IotUplinkBridgeService)
    private readonly iotUplinkBridgeService: IotUplinkBridgeService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (resolveConfiguredIotVendor() !== 'emqx') {
      return;
    }
    if (resolveConfiguredIotReceiveMode() !== 'mq') {
      return;
    }
    const brokerUrl = resolveEmqxBrokerUrl(getEnvString('EMQX_BROKER_URL', '') ?? '');
    if (!brokerUrl) {
      this.logger.warn(
        'EMQX 共享订阅消费者未启动：缺少 EMQX_BROKER_URL',
        { suppressRequestContext: true },
        EmqxSharedSubscriptionService.name,
      );
      return;
    }
    const topics = resolveSharedSubscriptionTopics();
    if (topics.length === 0) {
      this.logger.warn(
        'EMQX 共享订阅消费者未启动：未解析出任何订阅 topic',
        { suppressRequestContext: true },
        EmqxSharedSubscriptionService.name,
      );
      return;
    }

    const username = pickString(getEnvString('EMQX_MQTT_USERNAME'));
    const password = pickString(getEnvString('EMQX_MQTT_PASSWORD'));
    const cert = resolvePemValue('EMQX_MQTT_CLIENT_CERT_PEM', 'EMQX_MQTT_CLIENT_CERT_PEM_PATH');
    const key = resolvePemValue('EMQX_MQTT_CLIENT_KEY_PEM', 'EMQX_MQTT_CLIENT_KEY_PEM_PATH');
    const ca = resolvePemValue('EMQX_ROOT_CA_PEM', 'EMQX_ROOT_CA_PEM_PATH');
    const clientId = resolveSharedSubscriptionClientId();

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      cert: cert ? Buffer.from(cert, 'utf8') : undefined,
      key: key ? Buffer.from(key, 'utf8') : undefined,
      ca: ca ? Buffer.from(ca, 'utf8') : undefined,
      protocolVersion: 5,
      clean: true,
      resubscribe: true,
      keepalive: 60,
      connectTimeout: 15_000,
      reconnectPeriod: RECONNECT_PERIOD_MS,
      rejectUnauthorized: Boolean(ca),
    });
    this.bindLifecycleLogs(clientId);
    this.bindMessageHandler();
    await this.waitUntilConnected(clientId);
    await this.subscribeTopics(topics);
    this.logger.log(
      'EMQX 共享订阅消费者已启动',
      {
        suppressRequestContext: true,
        clientId,
        topics,
      },
      EmqxSharedSubscriptionService.name,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }
    client.removeAllListeners();
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }

  private bindLifecycleLogs(clientId: string): void {
    this.client?.on('error', (error) => {
      this.logger.warn(
        'EMQX 共享订阅客户端错误',
        {
          suppressRequestContext: true,
          clientId,
          reason: error.message,
        },
        EmqxSharedSubscriptionService.name,
      );
    });
    this.client?.on('reconnect', () => {
      this.logger.debug(
        'EMQX 共享订阅客户端正在重连',
        {
          suppressRequestContext: true,
          clientId,
        },
        EmqxSharedSubscriptionService.name,
      );
    });
    this.client?.on('close', () => {
      if (this.stopping) {
        return;
      }
      this.logger.warn(
        'EMQX 共享订阅客户端连接关闭',
        {
          suppressRequestContext: true,
          clientId,
        },
        EmqxSharedSubscriptionService.name,
      );
    });
  }

  private bindMessageHandler(): void {
    this.client?.on('message', (sharedTopic, payload) => {
      void this.handleMessage(sharedTopic, payload);
    });
  }

  private async waitUntilConnected(clientId: string): Promise<void> {
    if (this.client?.connected) {
      return;
    }
    await Promise.race([
      once(this.client as unknown as NodeJS.EventEmitter, 'connect'),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`EMQX shared subscription connect timeout after ${CONNECT_TIMEOUT_MS}ms`)), CONNECT_TIMEOUT_MS);
      }),
    ]).catch((error) => {
      this.logger.error(
        'EMQX 共享订阅客户端连接失败',
        {
          suppressRequestContext: true,
          clientId,
          reason: error instanceof Error ? error.message : String(error),
        },
        EmqxSharedSubscriptionService.name,
      );
      throw error;
    });
  }

  private async subscribeTopics(topics: string[]): Promise<void> {
    const client = this.client;
    if (!client) {
      throw new Error('EMQX shared subscription client is not initialised');
    }
    await new Promise<void>((resolve, reject) => {
      const subscriptionMap = Object.fromEntries(
        topics.map((topic) => [topic, { qos: 1 as const }]),
      ) as ISubscriptionMap;
      client.subscribe(
        subscriptionMap,
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  }

  private async handleMessage(sharedTopic: string, rawPayload: Buffer): Promise<void> {
    const topic = stripSharedSubscriptionPrefix(sharedTopic);
    const requestId = generateId();
    try {
      const normalized = this.emqxIngressAdapterService.normalize({
        channel: 'ingest',
        body: {
          topic,
          payload: rawPayload.toString('utf8'),
          request_id: requestId,
          received_at: Date.now(),
        },
      });
      const message: IotBridgeUplinkMessage = {
        vendor: normalized.vendor,
        topic: normalized.topic,
        payload: normalized.payload,
        requestId: normalized.requestId,
        receivedAt: normalized.receivedAt,
      };
      await this.iotUplinkBridgeService.bridgeUplink(message, {
        eventName: resolveIotBridgeEventPattern(normalized.topic),
        transport: 'mqtt',
        meta: {
          mqttSharedTopic: sharedTopic,
        },
      });
    } catch (error) {
      this.logger.error(
        'EMQX 共享订阅消息处理失败',
        {
          suppressRequestContext: true,
          requestId,
          idLabel: 'ReqId',
          topic,
          sharedTopic,
          reason: error instanceof Error ? error.message : String(error),
          rawPayload: rawPayload.toString('utf8'),
        },
        EmqxSharedSubscriptionService.name,
      );
    }
  }
}

function resolveSharedSubscriptionTopics(): string[] {
  const group = pickString(getEnvString('EMQX_SHARED_SUBSCRIPTION_GROUP')) ?? 'lumimax-iot';
  const raw =
    pickString(getEnvString('EMQX_SHARED_SUBSCRIPTION_TOPICS'))
    ?? 'v1/+/+/req';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((topic) => `$share/${group}/${stripSharedSubscriptionPrefix(topic)}`);
}

function resolveSharedSubscriptionClientId(): string {
  return `lumimax-iot-service-${generateId().slice(0, 16)}`;
}

function stripSharedSubscriptionPrefix(topic: string): string {
  const trimmed = topic.trim();
  if (!trimmed.startsWith('$share/')) {
    return trimmed;
  }
  const parts = trimmed.split('/');
  if (parts.length < 4) {
    return trimmed;
  }
  return parts.slice(3).join('/');
}
