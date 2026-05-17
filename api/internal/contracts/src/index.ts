export * from './grpc';
export * from './iot/access-error';
export * from './response/business-code';
export * from './response/error-i18n';
export * from './response/iot-emqx-queue-http.exception';

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp?: string;
  db?: {
    status: 'up' | 'down' | 'not_configured';
    required: boolean;
    durationMs?: number;
    database?: string;
    error?: string;
  };
}

export { envelopeSchema, iotEventSchemas } from './iot/schemas';
