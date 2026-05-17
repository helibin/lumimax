import { BadRequestException } from '@nestjs/common';
import {
  AwsIngressAdapterService,
  EmqxIngressAdapterService,
} from '@lumimax/iot-kit';

export interface NormalizedIotWebhook {
  topic: string;
  payload: Record<string, unknown>;
  receivedAt?: number;
}

const awsIngressAdapterService = new AwsIngressAdapterService();
const emqxIngressAdapterService = new EmqxIngressAdapterService();

export function normalizeIotWebhookBody(
  vendor: string,
  body: Record<string, unknown>,
): NormalizedIotWebhook {
  const normalizedVendor = vendor.trim().toLowerCase();
  try {
    const normalized = resolveAdapter(normalizedVendor).normalize({
      channel: 'webhook',
      body,
    });
    return {
      topic: normalized.topic,
      payload: normalized.payload,
      receivedAt: normalized.receivedAt,
    };
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : String(error));
  }
}

function resolveAdapter(vendor: string) {
  if (['emqx', 'emqx-ee', 'emqx-ce', 'mqtt'].includes(vendor)) {
    return emqxIngressAdapterService;
  }
  if (['aws', 'aws-iot', 'sqs'].includes(vendor)) {
    return awsIngressAdapterService;
  }
  throw new Error(`unsupported iot vendor: ${vendor}`);
}
