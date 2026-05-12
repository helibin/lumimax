export function parseFacadeJsonObject(payload?: string, fallback: Record<string, unknown> = {}) {
  if (!payload || payload.trim().length === 0) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return fallback;
  }
}
