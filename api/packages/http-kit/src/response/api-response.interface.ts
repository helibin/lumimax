export interface ApiErrorPayload {
  key?: string;
  locale?: string;
  rawMessage?: string;
  details?: unknown;
}

export interface ApiResponseEnvelope<T = unknown> {
  code: number;
  status: number;
  msg: string;
  data: T;
  pagination?: PaginationMeta;
  timestamp: number;
  requestId: string;
  error?: ApiErrorPayload;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PagedResult<T = unknown> {
  data: T[];
  pagination: PaginationMeta;
}

export type PagedData<T = unknown> = PagedResult<T>;
