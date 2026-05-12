export interface PaginationResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface AdminProfileView {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  status: string;
  roles: string[];
  permissions: string[];
  lastLoginAt: string;
}

export function normalizePage(input: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number(input.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(input.pageSize ?? 20) || 20));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function toPagination(page: number, pageSize: number, total: number): PaginationResult {
  const totalPages = total <= 0 ? 0 : Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasMore: page * pageSize < total,
  };
}

export function toIsoString(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

export function normalizeKeyword(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
