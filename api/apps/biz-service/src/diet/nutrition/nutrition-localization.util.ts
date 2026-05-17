export function pickLocalizedFoodName(input: {
  locale?: string;
  fallbackName: string;
  queryName?: string;
  aliases?: string[];
  raw?: Record<string, unknown>;
}): string {
  const fallbackName = input.fallbackName.trim();
  const language = normalizeLocaleLanguage(input.locale);
  if (!language) {
    return fallbackName;
  }

  const localizedFromRaw = pickLocalizedNameFromRaw(input.raw, language);
  if (localizedFromRaw) {
    return localizedFromRaw;
  }

  if (language === 'zh') {
    const localizedAlias = [input.queryName, ...(input.aliases ?? [])].find((item) => containsHanText(item));
    if (localizedAlias?.trim()) {
      return localizedAlias.trim();
    }
  }

  return fallbackName;
}

function pickLocalizedNameFromRaw(
  raw: Record<string, unknown> | undefined,
  language: string,
): string | undefined {
  if (!raw) {
    return undefined;
  }
  const candidates = [asRecord(raw.searchMatch), asRecord(raw.nutrition)];
  const suffixes = localizedFieldSuffixes(language);
  const baseFields = ['product_name', 'generic_name', 'name', 'label'];

  for (const record of candidates) {
    for (const field of baseFields) {
      for (const suffix of suffixes) {
        const value = pickString(record[`${field}_${suffix}`]);
        if (value) {
          return value;
        }
      }
    }
  }
  return undefined;
}

function localizedFieldSuffixes(language: string): string[] {
  switch (language) {
    case 'zh':
      return ['zh_cn', 'zh_hans', 'zh'];
    default:
      return [language];
  }
}

function normalizeLocaleLanguage(locale?: string): string | undefined {
  const normalized = locale?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return normalized.split(/[-_]/)[0] || undefined;
}

function containsHanText(value: string | undefined): boolean {
  return typeof value === 'string' && /[\p{Script=Han}]/u.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
