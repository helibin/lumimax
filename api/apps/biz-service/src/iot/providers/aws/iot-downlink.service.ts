import crypto from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  getEnvString,
  resolveAliyunCredentials,
  resolveAliyunRegion,
  resolveCloudCredentials,
  resolveCloudRegion,
} from '@lumimax/config';
import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import type { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { DeviceEntity, IotMessageEntity } from '../../../common/entities/biz.entities';
import type { BizIotTopicKind} from '../../iot.types';
import { type CloudIotVendorName } from '../../iot.types';
import { TopicParserService } from '../../events/topic-parser.service';
import { resolveTenantId } from '../../../common/tenant-scope.util';

const { IoTDataPlaneClient, PublishCommand } = require('@aws-sdk/client-iot-data-plane') as {
  IoTDataPlaneClient: new (input: Record<string, unknown>) => {
    send(command: unknown): Promise<unknown>;
  };
  PublishCommand: new (input: Record<string, unknown>) => unknown;
};
const { connectAsync } = require('mqtt') as {
  connectAsync: (
    brokerUrl: string,
    options: Record<string, unknown>,
  ) => Promise<{
    publishAsync(topic: string, message: string, options?: Record<string, unknown>): Promise<void>;
    endAsync(): Promise<void>;
  }>;
};

@Injectable()
export class IotDownlinkService {
  constructor(
    @Inject(AppLogger) private readonly logger: AppLogger,
    @InjectRepository(IotMessageEntity)
    private readonly iotMessageRepository: Repository<IotMessageEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepository: Repository<DeviceEntity>,
    @Inject(TopicParserService) private readonly topicParserService: TopicParserService,
  ) {}

  async publish(input: {
    vendor: CloudIotVendorName;
    deviceId: string;
    topicKind: BizIotTopicKind;
    payload: Record<string, unknown>;
    requestId: string;
    tenantId?: string;
    qos?: 0 | 1;
  }): Promise<{ topic: string; requestId: string; published: boolean }> {
    const topic = this.topicParserService.build(input.topicKind, input.deviceId);
    const messageKey = buildDownlinkMessageKey(input.requestId, topic);
    const device = await this.deviceRepository.findOne({
      where: [{ id: input.deviceId }, { deviceSn: input.deviceId }],
    });
    try {
      await this.iotMessageRepository.save(
        this.iotMessageRepository.create({
          tenantId: input.tenantId ?? device?.tenantId ?? resolveTenantId(),
          messageKey,
          deviceId: input.deviceId,
          direction: 'downstream',
          topic,
          event: pickString(asRecord(input.payload.meta).event) ?? 'unknown',
          status: 'published',
          payloadJson: input.payload,
          resultJson: null,
          errorJson: null,
        }),
      );
    } catch (error) {
      if (!isUniqueMessageKeyViolation(error)) {
        throw error;
      }
    }

    if (input.vendor === 'aws') {
      await this.publishToAws(topic, input.payload, input.qos ?? 1, input.requestId);
      return { topic, requestId: input.requestId, published: true };
    }

    if (input.vendor === 'aliyun') {
      await this.publishToAliyun(
        input.deviceId,
        topic,
        input.payload,
        input.qos ?? 1,
        input.requestId,
      );
      return { topic, requestId: input.requestId, published: true };
    }

    if (input.vendor === 'emqx') {
      await this.publishToEmqx(topic, input.payload, input.qos ?? 1, input.requestId);
      return { topic, requestId: input.requestId, published: true };
    }

    this.logger.warn(
      '跳过不支持的 IoT 下行厂商',
      {
        requestId: input.requestId,
        idLabel: 'ReqId',
        vendor: input.vendor,
      },
      IotDownlinkService.name,
    );
    return { topic, requestId: input.requestId, published: false };
  }

  private async publishToAws(
    topic: string,
    payload: Record<string, unknown>,
    qos: 0 | 1,
    requestId: string,
  ): Promise<void> {
    const endpoint = getEnvString('IOT_ENDPOINT', '')!;
    if (!endpoint) {
      this.logger.warn(
        '未配置 IOT_ENDPOINT，跳过下行发布',
        {
          requestId,
          idLabel: 'ReqId',
        },
        IotDownlinkService.name,
      );
      return;
    }
    const credentials = resolveCloudCredentials();
    const client = new IoTDataPlaneClient({
      region: resolveCloudRegion() ?? 'us-west-2',
      endpoint: `https://${endpoint}`,
      credentials,
    });
    await client.send(
      new PublishCommand({
        topic,
        payload: Buffer.from(JSON.stringify(payload)),
        qos,
      }),
    );
  }

  private async publishToAliyun(
    deviceId: string,
    topic: string,
    payload: Record<string, unknown>,
    qos: 0 | 1,
    requestId: string,
  ): Promise<void> {
    const regionId = resolveAliyunRegion() ?? '';
    const credentials = resolveAliyunCredentials();
    const accessKeyId = credentials?.accessKeyId ?? '';
    const accessKeySecret = credentials?.secretAccessKey ?? '';
    const endpoint = normalizeAliyunEndpoint(
      getEnvString('IOT_ENDPOINT', '') || `iot.${regionId}.aliyuncs.com`,
    );
    const instanceId = getEnvString('IOT_INSTANCE_ID', '') || undefined;

    if (!regionId || !accessKeyId || !accessKeySecret || !endpoint) {
      this.logger.warn(
        '阿里云 IoT 凭证不完整，跳过下行发布',
        {
          requestId,
          idLabel: 'ReqId',
        },
        IotDownlinkService.name,
      );
      return;
    }

    const device = await this.deviceRepository.findOne({
      where: [{ id: deviceId }, { deviceSn: deviceId }],
    });
    if (!device?.productKey) {
      this.logger.warn(
        '设备缺少 productKey，跳过阿里云下行发布',
        {
          requestId,
          idLabel: 'ReqId',
          deviceId,
        },
        IotDownlinkService.name,
      );
      return;
    }

    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Action: 'Pub',
      Format: 'JSON',
      MessageContent: Buffer.from(JSON.stringify(payload)).toString('base64'),
      ProductKey: device.productKey,
      Qos: String(qos),
      RegionId: regionId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: '1.0',
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      TopicFullName: buildAliyunTopicFullName(device.productKey, device.id, topic),
      Version: '2018-01-20',
    };

    if (instanceId) {
      params.IotInstanceId = instanceId;
    }

    params.Signature = signAliyunRpcParams(params, accessKeySecret);

    const response = await fetch(`${endpoint}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!response.ok) {
      throw new Error(
        `Aliyun IoT publish failed: ${response.status} ${await response.text()}`,
      );
    }
  }

  private async publishToEmqx(
    topic: string,
    payload: Record<string, unknown>,
    qos: 0 | 1,
    requestId: string,
  ): Promise<void> {
    const brokerUrl = resolveEmqxBrokerUrl(getEnvString('IOT_ENDPOINT', '') ?? '');
    if (!brokerUrl) {
      this.logger.warn(
        '未配置 IOT_ENDPOINT，跳过 EMQX 下行发布',
        {
          requestId,
          idLabel: 'ReqId',
        },
        IotDownlinkService.name,
      );
      return;
    }

    const username = pickString(getEnvString('IOT_MQTT_USERNAME'));
    const password = pickString(getEnvString('IOT_MQTT_PASSWORD'));
    const cert = decodePem(getEnvString('IOT_MQTT_CLIENT_CERT_PEM'));
    const key = decodePem(getEnvString('IOT_MQTT_CLIENT_KEY_PEM'));
    const ca = decodePem(getEnvString('IOT_ROOT_CA_PEM'));

    const client = await connectAsync(brokerUrl, {
      username,
      password,
      cert: cert ? Buffer.from(cert, 'utf8') : undefined,
      key: key ? Buffer.from(key, 'utf8') : undefined,
      ca: ca ? Buffer.from(ca, 'utf8') : undefined,
      protocolVersion: 5,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 0,
      rejectUnauthorized: Boolean(ca),
      clientId: `lumimax-biz-${crypto.randomUUID()}`,
    });

    try {
      await client.publishAsync(topic, JSON.stringify(payload), { qos });
    } finally {
      await client.endAsync();
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeAliyunEndpoint(value: string): string {
  const endpoint = value.trim().replace(/\/+$/g, '');
  if (!endpoint) {
    return '';
  }
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  return `https://${endpoint}`;
}

function resolveEmqxBrokerUrl(value: string): string {
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

function decodePem(value: string | undefined): string | undefined {
  const normalized = pickString(value)?.replace(/\\n/g, '\n');
  return normalized ? normalized.endsWith('\n') ? normalized : `${normalized}\n` : undefined;
}

function buildAliyunTopicFullName(
  productKey: string,
  deviceName: string,
  logicalTopic: string,
): string {
  return `/${productKey}/${deviceName}/user/${logicalTopic.replace(/^\/+/g, '')}`;
}

function signAliyunRpcParams(
  params: Record<string, string>,
  accessKeySecret: string,
): string {
  const canonicalized = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&');
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalized)}`;
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64');
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function buildDownlinkMessageKey(requestId: string, topic: string): string {
  const normalizedRequestId = requestId.trim();
  const topicDigest = crypto
    .createHash('sha1')
    .update(topic)
    .digest('hex')
    .slice(0, 16);
  return `${normalizedRequestId}:${topicDigest}`;
}

function isUniqueMessageKeyViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
  return (
    driverError?.code === '23505'
    && driverError?.constraint === 'iot_messages_message_key_key'
  );
}
