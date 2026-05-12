import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BusinessCode, type BusinessErrorKey } from './business-code';

export type SupportedLocale = 'zh-CN' | 'en-US' | 'ko-KR';

export interface ErrorCodeDefinition {
  code: number;
  key: BusinessErrorKey;
  explanation: string;
}

export const SUPPORTED_LOCALES: SupportedLocale[] = ['zh-CN', 'en-US', 'ko-KR'];

export const ERROR_CODE_DEFINITIONS: ErrorCodeDefinition[] = [
  { code: BusinessCode.SUCCESS, key: 'ok', explanation: 'success' },
  { code: BusinessCode.USER_NOAUTH, key: 'user.noauth', explanation: 'missing auth context' },
  { code: BusinessCode.USER_TOKEN_INVALID, key: 'user.token_invalid', explanation: 'token invalid or expired' },
  { code: BusinessCode.AUTH_INVALID_CREDENTIALS, key: 'auth.invalid_credentials', explanation: 'credentials mismatch' },
  { code: BusinessCode.USER_NOT_REGISTERED, key: 'user.not_registered', explanation: 'account not registered' },
  { code: BusinessCode.USER_DISABLED, key: 'user.disabled', explanation: 'account is disabled or frozen' },
  { code: BusinessCode.REQUEST_INVALID_PARAMS, key: 'request.invalid_params', explanation: 'invalid parameters' },
  { code: BusinessCode.REQUEST_VALIDATION_FAILED, key: 'request.validation_failed', explanation: 'validation failed' },
  { code: BusinessCode.USER_FORBIDDEN, key: 'user.forbidden', explanation: 'permission denied' },
  { code: BusinessCode.RESOURCE_NOT_FOUND, key: 'resource.not_found', explanation: 'resource not found' },
  { code: BusinessCode.RESOURCE_CONFLICT, key: 'resource.conflict', explanation: 'resource conflict' },
  { code: BusinessCode.REQUEST_UNPROCESSABLE, key: 'request.unprocessable', explanation: 'unprocessable request' },
  { code: BusinessCode.REQUEST_TOO_MANY, key: 'request.too_many', explanation: 'too many requests' },
  { code: BusinessCode.UPSTREAM_UNAVAILABLE, key: 'upstream.unavailable', explanation: 'upstream unavailable' },
  { code: BusinessCode.UPSTREAM_TIMEOUT, key: 'upstream.timeout', explanation: 'upstream timeout' },
  { code: BusinessCode.INTERNAL_ERROR, key: 'system.internal_error', explanation: 'internal error' },
];

const ERROR_BY_CODE = new Map<number, ErrorCodeDefinition>(ERROR_CODE_DEFINITIONS.map((item) => [item.code, item]));
const ERROR_BY_KEY = new Map<BusinessErrorKey, ErrorCodeDefinition>(ERROR_CODE_DEFINITIONS.map((item) => [item.key, item]));
const MESSAGES_CACHE = new Map<SupportedLocale, Record<string, string>>();
const DEFAULT_LOCALE: SupportedLocale = 'en-US';

export function resolveLocaleFromRequest(input?: {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): SupportedLocale {
  const queryLocale = pickFirstString(input?.query?.lang ?? input?.query?.locale);
  const headerLocale = pickFirstString(
    input?.headers?.['x-lang']
      ?? input?.headers?.['x-locale']
      ?? input?.headers?.['accept-language'],
  );
  return normalizeLocale(queryLocale ?? headerLocale);
}

export function normalizeLocale(value?: string | null): SupportedLocale {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (!normalized) return 'zh-CN';

  const localeMap: Array<{ match: RegExp; locale: SupportedLocale }> = [
    { match: /zh/, locale: 'zh-CN' },
    { match: /ko|kr/, locale: 'ko-KR' },
    { match: /en/, locale: 'en-US' },
  ];

  return localeMap.find(({ match }) => match.test(normalized))?.locale ?? 'zh-CN';
}


export function getErrorDefinitionByCode(code: number): ErrorCodeDefinition {
  return ERROR_BY_CODE.get(code) ?? ERROR_BY_CODE.get(BusinessCode.INTERNAL_ERROR)!;
}

export function getErrorDefinitionByKey(key: BusinessErrorKey): ErrorCodeDefinition {
  return ERROR_BY_KEY.get(key) ?? ERROR_BY_CODE.get(BusinessCode.INTERNAL_ERROR)!;
}

export function localizeErrorMessageByCode(
  code: number,
  locale: SupportedLocale,
): string {
  const definition = getErrorDefinitionByCode(code);
  return localizeErrorMessageByKey(definition.key, locale);
}

export function localizeErrorMessageByKey(
  key: BusinessErrorKey,
  locale: SupportedLocale,
): string {
  const messages = getLocaleMessages(locale);
  const fallbackMessages = getLocaleMessages(DEFAULT_LOCALE);
  return messages[key] ?? fallbackMessages[key] ?? key;
}

function getLocaleMessages(locale: SupportedLocale): Record<string, string> {
  const cached = MESSAGES_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const i18nRoot = resolveI18nRoot();
  const loaded = loadLocaleMessagesFromRoot(i18nRoot, locale);

  MESSAGES_CACHE.set(locale, loaded);
  return loaded;
}

function loadLocaleMessagesFromRoot(
  i18nRoot: string,
  locale: SupportedLocale,
): Record<string, string> {
  const directoryPath = join(i18nRoot, locale);
  if (existsSync(directoryPath)) {
    return loadLocaleMessagesFromDirectory(directoryPath);
  }

  const legacyFilePath = join(i18nRoot, `${locale}.json`);
  return loadLocaleJsonFile(legacyFilePath);
}

function loadLocaleMessagesFromDirectory(directoryPath: string): Record<string, string> {
  const merged: Record<string, string> = {};

  try {
    const fileNames = readdirSync(directoryPath)
      .filter((fileName) => fileName.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of fileNames) {
      const filepath = join(directoryPath, fileName);
      Object.assign(merged, loadLocaleJsonFile(filepath));
    }
  } catch {
    return {};
  }

  return merged;
}

function loadLocaleJsonFile(filepath: string): Record<string, string> {
  if (!existsSync(filepath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(filepath, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveI18nRoot(): string {
  const fromCwd = findWorkspaceRoot(process.cwd());
  if (fromCwd) {
    return join(fromCwd, 'i18n');
  }

  const fromDirname = findWorkspaceRoot(__dirname);
  if (fromDirname) {
    return join(fromDirname, 'i18n');
  }

  return join(process.cwd(), 'i18n');
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = start;
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function pickFirstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim().length > 0) {
        return item.trim();
      }
    }
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
