import type { AuthenticatedUser } from '@lumimax/auth';

export const DEVICE_OPERATION_PORT = Symbol('DEVICE_OPERATION_PORT');

export interface DeviceOperationInput {
  operation: string;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  user: AuthenticatedUser | null;
  tenantScope?: string;
  requestId: string;
}

export interface DeviceOperationPort {
  execute<T = unknown>(input: DeviceOperationInput): Promise<T>;
}
