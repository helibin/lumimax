export * from './grpc';
export * from './response/business-code';
export * from './response/error-i18n';

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
