import { registerAs } from '@nestjs/config';

export const cloudConfigToken = 'cloud';

export interface CloudConfigValues {
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    iot: {
      policyName: string;
      endpoint?: string;
      upstreamSqsUrl?: string;
    };
  };
  aliyun: {
    regionId: string;
    accessKeyId: string;
    accessKeySecret: string;
    instanceId?: string;
    endpoint?: string;
    productKeyMap: Record<string, string>;
    mnsEndpoint?: string;
    upstreamQueueName?: string;
  };
}

export const CloudConfig = registerAs(
  cloudConfigToken,
  (): CloudConfigValues => ({
    aws: {
      region: process.env.CLOUD_REGION?.trim() ?? '',
      accessKeyId: process.env.CLOUD_ACCESS_KEY_ID?.trim() ?? '',
      secretAccessKey: process.env.CLOUD_ACCESS_KEY_SECRET?.trim() ?? '',
      iot: {
        policyName: process.env.IOT_POLICY_NAME ?? '',
        endpoint: process.env.IOT_ENDPOINT,
        upstreamSqsUrl: process.env.IOT_QUEUE_URL,
      },
    },
    aliyun: {
      regionId: process.env.CLOUD_REGION?.trim() ?? '',
      accessKeyId: process.env.CLOUD_ACCESS_KEY_ID?.trim() ?? '',
      accessKeySecret: process.env.CLOUD_ACCESS_KEY_SECRET?.trim() ?? '',
      instanceId: process.env.IOT_INSTANCE_ID,
      endpoint: process.env.IOT_ENDPOINT,
      productKeyMap: parseProductKeyMap(process.env.IOT_PRODUCT_KEY_MAP),
      mnsEndpoint: process.env.IOT_MNS_ENDPOINT,
      upstreamQueueName: process.env.IOT_QUEUE_NAME,
    },
  }),
);

function parseProductKeyMap(value?: string): Record<string, string> {
  if (!value?.trim()) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, string>;
  } catch (error) {
    throw new Error(`IOT_PRODUCT_KEY_MAP must be valid JSON: ${String(error)}`);
  }
}
