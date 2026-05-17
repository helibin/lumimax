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
  };
}

export const CloudConfig = registerAs(
  cloudConfigToken,
  (): CloudConfigValues => ({
    aws: {
      region: process.env.STORAGE_REGION?.trim() ?? '',
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID?.trim() ?? '',
      secretAccessKey: process.env.STORAGE_ACCESS_KEY_SECRET?.trim() ?? '',
      iot: {
        policyName: process.env.AWS_IOT_POLICY_NAME ?? '',
        endpoint: process.env.AWS_IOT_ENDPOINT,
        upstreamSqsUrl: process.env.AWS_SQS_QUEUE_URL,
      },
    },
    aliyun: {
      regionId: process.env.STORAGE_REGION?.trim() ?? '',
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID?.trim() ?? '',
      accessKeySecret: process.env.STORAGE_ACCESS_KEY_SECRET?.trim() ?? '',
    },
  }),
);
