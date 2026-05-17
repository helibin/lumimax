import { Agent } from 'undici';
import { getEnvString } from '@lumimax/config';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppLogger, formatErrorMessageForLog } from '@lumimax/logger';
import type {
  IotConnectionFeedbackMessage,
  IotDownstreamMessage,
  IotEgressAdapter,
} from '../../interfaces/iot-egress-adapter.interface';
import type { PublishMessage } from '../../interfaces/iot-provider.interface';
import {
  pickString,
  resolveEmqxRestBaseUrl,
  resolvePemValue,
} from '../provider-publish.util';

type RestTlsDispatcherState =
  | { kind: 'unset' }
  | { kind: 'default' }
  | { kind: 'agent'; agent: Agent };

@Injectable()
export class EmqxProviderService implements IotEgressAdapter, OnModuleDestroy {
  readonly vendor = 'emqx' as const;

  private restTlsDispatcher: RestTlsDispatcherState = { kind: 'unset' };

  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  async onModuleDestroy(): Promise<void> {
    if (this.restTlsDispatcher.kind === 'agent') {
      void this.restTlsDispatcher.agent.close();
      this.restTlsDispatcher = { kind: 'unset' };
    }
  }

  async publishDownstream(input: IotDownstreamMessage): Promise<void> {
    const endpoint = getEnvString('EMQX_BROKER_URL', '') ?? '';
    const restBaseUrl = resolveEmqxRestBaseUrl(
      getEnvString('EMQX_HTTP_BASE_URL', '') || endpoint,
    );
    if (!restBaseUrl) {
      this.logger.warn(
        '未配置 EMQX_HTTP_BASE_URL / EMQX_BROKER_URL，跳过 EMQX 下行发布',
        {
          requestId: input.requestId,
          idLabel: 'ReqId',
        },
        EmqxProviderService.name,
      );
      return;
    }
    await this.publishViaRest(restBaseUrl, input);
  }

  async publishConnectionFeedback(
    input: IotConnectionFeedbackMessage,
  ): Promise<boolean> {
    await this.publishDownstream(input);
    return true;
  }

  async publish(input: PublishMessage): Promise<void> {
    await this.publishDownstream(input);
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

  private async publishViaRest(baseUrl: string, input: IotDownstreamMessage): Promise<void> {
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
