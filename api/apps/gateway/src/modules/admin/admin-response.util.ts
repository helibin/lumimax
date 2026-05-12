export function normalizeAdminPaged(value: any): any {
  if (!value || !Array.isArray(value.items) || !value.pagination) {
    return value;
  }
  const page = Number(value.pagination.page ?? 1);
  const pageSize = Number(value.pagination.pageSize ?? 20);
  const total = Number(value.pagination.total ?? 0);
  const totalPages = Number(value.pagination.totalPages ?? Math.ceil(total / Math.max(pageSize, 1)));
  return {
    data: value.items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: Boolean(value.pagination.hasMore ?? page < totalPages),
    },
  };
}

export function jsonString(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
