import { ConflictException, HttpStatus } from '@nestjs/common';
import { BusinessCode } from './business-code';

const MESSAGE =
  'EMQX is configured with IOT_RECEIVE_MODE=mq: uplink must use the RabbitMQ bridge only. '
  + 'Set IOT_RECEIVE_MODE=callback to allow HTTP/gRPC ingest, or stop using HTTP uplink endpoints.';

export function createIotEmqxQueueHttpIngestDisabledException(): ConflictException {
  return new ConflictException({
    message: MESSAGE,
    businessCode: BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED,
    code: BusinessCode.IOT_EMQX_QUEUE_MODE_HTTP_INGEST_DISABLED,
    key: 'iot.emqx_queue_mode_http_ingest_disabled',
    statusCode: HttpStatus.CONFLICT,
  });
}
