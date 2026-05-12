import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestTraceContext {
  requestId: string;
  traceId: string;
  startTime: number;
  clientId?: string;
  userId?: string;
  tenantId?: string;
  extensions?: Record<string, string | number | boolean | null | undefined>;
}

export interface GrpcMetadataLike {
  set(key: string, value: string): unknown;
  get?(key: string): unknown;
}

export interface RequestContextStore {
  requestId: string;
  traceId: string;
  startTime: number;
  clientId?: string;
  userId?: string;
  tenantId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export class RequestContextService {
  run<T>(context: RequestContextStore, callback: () => T): T {
    return storage.run(context, callback);
  }

  getStore(): RequestContextStore | undefined {
    return storage.getStore();
  }

  getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  }

  getTraceId(): string | undefined {
    return storage.getStore()?.traceId;
  }

  getStartTime(): number | undefined {
    return storage.getStore()?.startTime;
  }

  set<TKey extends keyof RequestContextStore>(
    key: TKey,
    value: RequestContextStore[TKey],
  ): void {
    const current = storage.getStore();
    if (!current) {
      return;
    }
    current[key] = value;
  }

  get<TKey extends keyof RequestContextStore>(
    key: TKey,
  ): RequestContextStore[TKey] | undefined {
    return storage.getStore()?.[key];
  }
}

export function runRequestContext<T>(
  context: RequestContextStore,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getRequestContextStore(): RequestContextStore | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: RequestTraceContext,
  callback: () => T,
): T {
  return runRequestContext(context, callback);
}

export function getRequestContext(): RequestTraceContext | undefined {
  return getRequestContextStore();
}

export function getCurrentRequestId(): string | undefined {
  return getRequestContextStore()?.requestId;
}

export function getCurrentTraceId(): string | undefined {
  return getRequestContextStore()?.traceId;
}

export function getCurrentUserId(): string | undefined {
  return getRequestContextStore()?.userId;
}

export function setCurrentUserId(userId?: string): void {
  const context = getRequestContextStore();
  if (!context || !userId) {
    return;
  }
  context.userId = userId;
}

export function setCurrentTenantId(tenantId?: string): void {
  const context = getRequestContextStore();
  if (!context || !tenantId) {
    return;
  }
  context.tenantId = tenantId;
}
