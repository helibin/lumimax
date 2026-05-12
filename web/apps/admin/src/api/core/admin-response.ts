function pickObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonItem<T>(value: unknown): null | T {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export interface AdminPagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function normalizeAdminItems<T = unknown>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  const target = pickObject(payload);
  const data = Array.isArray(target.data) ? target.data : null;
  if (data) {
    return data as T[];
  }

  const items = Array.isArray(target.items) ? target.items : null;
  if (items) {
    return items as T[];
  }

  const itemsJson = Array.isArray(target.items_json) ? target.items_json : null;
  if (itemsJson) {
    return itemsJson
      .map((item) => parseJsonItem<T>(item))
      .filter((item): item is T => item !== null);
  }

  return [];
}

export function normalizeAdminPaged<T = unknown>(payload: unknown): AdminPagedResult<T> {
  const target = pickObject(payload);
  const pagination = pickObject(target.pagination);
  const items = normalizeAdminItems<T>(payload);
  const page = Number(pagination.page ?? 1);
  const pageSize = Number(pagination.pageSize ?? pagination.page_size ?? items.length ?? 0);
  const total = Number(pagination.total ?? target.total ?? items.length);
  const totalPages = Number(
    pagination.totalPages ??
      pagination.total_pages ??
      (pageSize > 0 ? Math.ceil(total / pageSize) : 0),
  );

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
  };
}
