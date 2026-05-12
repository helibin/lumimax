import { parseGrpcJson, resolveGrpcRequestId } from './gateway-grpc.util';

export interface GrpcFacadeExecutePayload {
  operation?: string;
  params_json?: string;
  query_json?: string;
  body_json?: string;
  user_json?: string;
  tenant_scope?: string;
  request_id?: string;
}

export interface ParsedGrpcFacadeExecuteInput<TUser = Record<string, unknown> | null> {
  operation: string;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  user: TUser;
  tenantScope: string;
  requestId: string;
}

export function parseGrpcFacadeExecutePayload<TUser = Record<string, unknown> | null>(
  payload: GrpcFacadeExecutePayload,
  metadata?: unknown,
): ParsedGrpcFacadeExecuteInput<TUser> {
  return {
    operation: payload.operation ?? '',
    params: parseGrpcJson<Record<string, unknown>>(payload.params_json, {}),
    query: parseGrpcJson<Record<string, unknown>>(payload.query_json, {}),
    body: parseGrpcJson<Record<string, unknown>>(payload.body_json, {}),
    user: parseGrpcJson<TUser>(payload.user_json, null as TUser),
    tenantScope: payload.tenant_scope ?? '',
    requestId: resolveGrpcRequestId(payload.request_id, metadata),
  };
}
