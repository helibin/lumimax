export interface SqsEnvelope<TBody = Record<string, unknown>> {
  messageId: string;
  receiptHandle?: string;
  requestId?: string;
  body: TBody;
  rawBody: string;
}

export interface SqsPollOptions {
  queueUrl: string;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
  batchSize?: number;
}
