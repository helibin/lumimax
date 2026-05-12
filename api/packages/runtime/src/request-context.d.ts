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
export declare class RequestContextService {
    run<T>(context: RequestContextStore, callback: () => T): T;
    getStore(): RequestContextStore | undefined;
    getRequestId(): string | undefined;
    getTraceId(): string | undefined;
    getStartTime(): number | undefined;
    set<TKey extends keyof RequestContextStore>(key: TKey, value: RequestContextStore[TKey]): void;
    get<TKey extends keyof RequestContextStore>(key: TKey): RequestContextStore[TKey] | undefined;
}
export declare function runRequestContext<T>(context: RequestContextStore, callback: () => T): T;
export declare function getRequestContextStore(): RequestContextStore | undefined;
export declare function runWithRequestContext<T>(context: RequestTraceContext, callback: () => T): T;
export declare function getRequestContext(): RequestTraceContext | undefined;
export declare function getCurrentRequestId(): string | undefined;
export declare function getCurrentTraceId(): string | undefined;
export declare function getCurrentUserId(): string | undefined;
export declare function setCurrentUserId(userId?: string): void;
export declare function setCurrentTenantId(tenantId?: string): void;
