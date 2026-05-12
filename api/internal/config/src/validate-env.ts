export function validateRequiredEnv(
  values: Record<string, unknown>,
  requiredKeys: string[],
): Record<string, unknown> {
  const missing = requiredKeys.filter((key) => {
    const value = values[key];
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(`Missing required env keys: ${missing.join(', ')}`);
  }
  return values;
}
