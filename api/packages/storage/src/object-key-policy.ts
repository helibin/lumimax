export function assertSafeObjectKey(objectKey: string): string {
  const normalized = normalizeObjectKey(objectKey);
  if (normalized.includes('..')) {
    throw new Error('objectKey 包含非法的父级路径跳转');
  }
  if (normalized.startsWith('/')) {
    throw new Error('objectKey 必须是相对路径');
  }
  return normalized;
}

export function normalizeObjectKey(objectKey: string): string {
  const normalized = String(objectKey ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/g, '')
    .replace(/\/{2,}/g, '/');
  if (!normalized) {
    throw new Error('objectKey 不能为空');
  }
  return normalized;
}

export function isTemporaryObjectKey(objectKey: string): boolean {
  return assertSafeObjectKey(objectKey).startsWith('tmp-file/');
}

export function extractObjectFilename(objectKey: string): string {
  const normalized = assertSafeObjectKey(objectKey).replace(/\/+$/g, '');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function assertObjectKeyOwnedByPrefix(
  objectKey: string,
  prefix: string,
): string {
  const normalizedKey = assertSafeObjectKey(objectKey);
  const normalizedPrefix = normalizeObjectKey(prefix).replace(/\/?$/, '/');
  if (!normalizedKey.startsWith(normalizedPrefix)) {
    throw new Error('objectKey 权限不足，拒绝访问');
  }
  return normalizedKey;
}
