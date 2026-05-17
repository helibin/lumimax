import { getEnvString } from './runtime-env';
import { resolveConfiguredIotVendor } from './iot-vendor.util';

export type IotReceiveMode = 'mq' | 'callback';

/**
 * `IOT_RECEIVE_MODE` (default `mq`) combined with `IOT_VENDOR`:
 *
 * | Vendor | Mode     | Uplink |
 * |--------|----------|--------|
 * | aws    | mq       | SQS (`AWS_SQS_QUEUE_URL`) |
 * | aws    | callback | HTTP/gRPC ingest only (no SQS consumer) |
 * | emqx   | mq       | RabbitMQ bridge only — reject HTTP/gRPC ingest; **biz connects RMQ consumer** when `RABBITMQ_URL` is set |
 * | emqx   | callback | HTTP/gRPC ingest; **no RMQ microservice** (even if `RABBITMQ_URL` is set); warn if URL set |
 */
export function resolveConfiguredIotReceiveMode(): IotReceiveMode {
  const raw = (getEnvString('IOT_RECEIVE_MODE', 'mq') ?? 'mq').trim().toLowerCase();
  return raw === 'callback' ? 'callback' : 'mq';
}

/** True when EMQX uplink must not use HTTP/gRPC `IngestCloudMessage` or EMQX HTTP ingest (use RabbitMQ bridge only). */
export function shouldRejectEmqxHttpStyleUplinkIngest(): boolean {
  return resolveConfiguredIotVendor() === 'emqx' && resolveConfiguredIotReceiveMode() === 'mq';
}
