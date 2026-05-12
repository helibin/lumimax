import { Injectable } from '@nestjs/common';
import type { FoodIdentityProfile } from '../interfaces/diet-center.contracts';

@Injectable()
export class FoodIdentityService {
  buildIdentity(input: {
    name: string;
    locale?: string;
    countryCode?: string;
    sourceType: FoodIdentityProfile['sourceType'];
    verifiedLevel?: FoodIdentityProfile['verifiedLevel'];
    aliases?: string[];
  }): FoodIdentityProfile {
    const canonicalName = this.toCanonicalName(input.name);
    const aliases = dedupeStrings([
      canonicalName,
      input.name,
      ...(input.aliases ?? []),
      ...this.expandAliases(canonicalName, input.locale),
    ]);

    return {
      canonicalName,
      normalizedName: this.normalizeName(canonicalName),
      aliases,
      locale: input.locale,
      countryCode: input.countryCode,
      sourceType: input.sourceType,
      verifiedLevel: input.verifiedLevel ?? inferVerifiedLevel(input.sourceType),
    };
  }

  normalizeName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  toCanonicalName(value: string): string {
    const normalized = this.normalizeName(value);
    return aliasToCanonicalName.get(normalized) ?? normalized;
  }

  buildSearchTerms(input: {
    name: string;
    locale?: string;
    aliases?: string[];
  }): string[] {
    const identity = this.buildIdentity({
      name: input.name,
      locale: input.locale,
      aliases: input.aliases,
      sourceType: 'manual',
    });
    return identity.aliases;
  }

  scoreNameMatch(input: {
    queryNames: string[];
    targetName: string;
    aliases?: string[];
  }): number {
    const targets = dedupeStrings([input.targetName, ...(input.aliases ?? [])]).map((item) =>
      this.normalizeName(item),
    );
    let best = 0;
    for (const queryName of input.queryNames) {
      const query = this.normalizeName(queryName);
      for (const target of targets) {
        best = Math.max(best, compareNormalizedNames(query, target));
      }
    }
    return best;
  }

  private expandAliases(name: string, locale?: string): string[] {
    const normalized = this.normalizeName(name);
    const aliasSet = canonicalNameToAliases.get(normalized) ?? [];
    if (!locale?.trim()) {
      return aliasSet.map((item) => item.value);
    }
    const localePrefix = locale.trim().toLowerCase().split('-')[0];
    return aliasSet.filter((item) => item.localePrefix === 'all' || item.localePrefix === localePrefix)
      .map((item) => item.value);
  }
}

const aliasSeed: Array<{ canonical: string; aliases: string[]; localePrefix?: string }> = [
  { canonical: 'steamed white rice', aliases: ['rice', 'white rice', 'steamed rice', '米饭', '白饭', 'ご飯', 'ごはん', '흰쌀밥', 'arroz blanco', 'nasi putih'] },
  { canonical: 'fried egg', aliases: ['egg', '煎蛋', '鸡蛋', '目玉焼き', '계란후라이'] },
  { canonical: 'chicken breast', aliases: ['chicken', '鸡胸肉', '鶏むね肉', '닭가슴살'] },
  { canonical: 'green salad', aliases: ['salad', '蔬菜沙拉', '샐러드', 'ensalada'] },
  { canonical: 'apple', aliases: ['苹果', 'りんご', '사과', 'manzana'] },
  { canonical: 'banana', aliases: ['香蕉', 'バナナ', '바나나'] },
];

const aliasToCanonicalName = new Map<string, string>();
const canonicalNameToAliases = new Map<string, Array<{ value: string; localePrefix: string }>>();

for (const entry of aliasSeed) {
  const canonical = normalizeStatic(entry.canonical);
  const aliases = dedupeStrings([entry.canonical, ...entry.aliases]);
  canonicalNameToAliases.set(
    canonical,
    aliases.map((value) => ({
      value,
      localePrefix: entry.localePrefix ?? 'all',
    })),
  );
  for (const alias of aliases) {
    aliasToCanonicalName.set(normalizeStatic(alias), canonical);
  }
}

function inferVerifiedLevel(
  sourceType: FoodIdentityProfile['sourceType'],
): FoodIdentityProfile['verifiedLevel'] {
  switch (sourceType) {
    case 'user_common':
      return 'confirmed';
    case 'internal':
    case 'provider':
      return 'verified';
    case 'llm_estimated':
      return 'estimated';
    default:
      return 'unverified';
  }
}

function compareNormalizedNames(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.includes(right) || right.includes(left)) {
    return 0.86;
  }
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const intersection = [...leftTokens].filter((item) => rightTokens.has(item)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeStatic(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function normalizeStatic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
