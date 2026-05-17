export function normalizeLocalhostConnectionUrl(url?: string): string | undefined {
  const value = url?.trim();
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      return parsed.toString();
    }
  } catch {
    return value;
  }

  return value;
}
