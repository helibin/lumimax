const TRUE_VALUES = new Set(['true', '1', 'yes']);
const FALSE_VALUES = new Set(['false', '0', 'no']);

export class EnvUtil {
  static get(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined || value === '') {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`[EnvUtil] Missing required environment variable: ${key}`);
    }
    return value;
  }

  static getNumber(key: string, defaultValue?: number): number {
    const raw = process.env[key];
    if (raw === undefined || raw === '') {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`[EnvUtil] Missing required environment variable: ${key}`);
    }

    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`[EnvUtil] Environment variable ${key} must be a valid number`);
    }
    return parsed;
  }

  static getBoolean(key: string, defaultValue?: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined || raw === '') {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`[EnvUtil] Missing required environment variable: ${key}`);
    }

    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (FALSE_VALUES.has(normalized)) {
      return false;
    }

    throw new Error(
      `[EnvUtil] Environment variable ${key} must be one of: true/false, 1/0, yes/no`,
    );
  }
}

export function ensureServiceName(serviceName: string): void {
  if (!process.env.SERVICE_NAME) {
    process.env.SERVICE_NAME = serviceName;
  }
}

export function getEnvString(key: string, fallback?: string): string | undefined {
  try {
    return EnvUtil.get(key, fallback);
  } catch {
    if (fallback !== undefined) {
      return fallback;
    }
    return undefined;
  }
}

export function getRequiredEnvString(key: string): string {
  return EnvUtil.get(key);
}

export function getEnvNumber(key: string, fallback: number): number {
  try {
    return EnvUtil.getNumber(key, fallback);
  } catch {
    return fallback;
  }
}
