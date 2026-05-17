import { getEnvString, resolveIotCredentials, resolveIotRegion } from '@lumimax/config';
import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@lumimax/logger';
import type {
  IotConnectionFeedbackMessage,
  IotDownstreamMessage,
  IotEgressAdapter,
} from '../../interfaces/iot-egress-adapter.interface';
import type { PublishMessage } from '../../interfaces/iot-provider.interface';

const { IoTDataPlaneClient, PublishCommand } = require('@aws-sdk/client-iot-data-plane') as {
  IoTDataPlaneClient: new (input: Record<string, unknown>) => {
    send(command: unknown): Promise<unknown>;
  };
  PublishCommand: new (input: Record<string, unknown>) => unknown;
};

@Injectable()
export class AwsProviderService implements IotEgressAdapter {
  readonly vendor = 'aws' as const;

  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}

  async publishDownstream(input: IotDownstreamMessage): Promise<void> {
    const endpoint = getEnvString('AWS_IOT_ENDPOINT', '')!;
    if (!endpoint) {
      this.logger.warn(
        '未配置 AWS_IOT_ENDPOINT，跳过 AWS IoT 下行发布',
        {
          requestId: input.requestId,
          idLabel: 'ReqId',
        },
        AwsProviderService.name,
      );
      return;
    }

    const client = new IoTDataPlaneClient({
      region: resolveIotRegion() ?? 'us-west-2',
      endpoint: `https://${endpoint}`,
      credentials: resolveIotCredentials(),
    });
    await client.send(
      new PublishCommand({
        topic: input.topic,
        payload: Buffer.from(JSON.stringify(input.payload)),
        qos: input.qos,
      }),
    );
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
}
