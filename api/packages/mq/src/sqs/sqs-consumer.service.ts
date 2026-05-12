import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Inject, Injectable } from '@nestjs/common';
import type { SqsEnvelope, SqsPollOptions } from './sqs-consumer.types';

@Injectable()
export class SqsConsumerService {
  constructor(@Inject(SQSClient) private readonly client: SQSClient) {}

  async poll<TBody = Record<string, unknown>>(
    options: SqsPollOptions,
  ): Promise<SqsEnvelope<TBody>[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: options.queueUrl,
        MaxNumberOfMessages: options.batchSize ?? 10,
        VisibilityTimeout: options.visibilityTimeout ?? 60,
        WaitTimeSeconds: options.waitTimeSeconds ?? 10,
      }),
    );

    return (response.Messages ?? []).map((message: {
      MessageId?: string;
      ReceiptHandle?: string;
      Body?: string;
    }) => {
      const rawBody = message.Body ?? '{}';
      const body = JSON.parse(rawBody) as TBody;
      return {
        messageId: message.MessageId ?? '',
        receiptHandle: message.ReceiptHandle,
        requestId: this.extractRequestId(body),
        body,
        rawBody,
      };
    });
  }

  async ack(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  private extractRequestId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const record = body as Record<string, unknown>;
    if (typeof record.requestId === 'string') return record.requestId;
    if (record.meta && typeof record.meta === 'object') {
      const meta = record.meta as Record<string, unknown>;
      if (typeof meta.requestId === 'string') return meta.requestId;
    }
    return undefined;
  }
}
