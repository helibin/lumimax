import { Client } from 'pg';

const DEFAULT_MAX_ATTEMPTS = 15;
const INITIAL_DELAY_MS = 400;
const MAX_DELAY_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when another connect attempt may succeed (Postgres still starting, transient TCP reset, etc.). */
export function isTransientPgConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as NodeJS.ErrnoException & { message?: string };
  const transientCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
  ]);
  if (err.code && transientCodes.has(err.code)) {
    return true;
  }
  const msg = String(err.message ?? error);
  if (/connection terminated unexpectedly/i.test(msg)) {
    return true;
  }
  if (/socket hang up/i.test(msg)) {
    return true;
  }
  return false;
}

/**
 * Connect with backoff — used at bootstrap when multiple services may hit Postgres at once
 * (e.g. supervisord starting base-service + biz-service together).
 */
export async function connectPgWithRetry(
  connectionString: string,
  options?: { maxAttempts?: number },
): Promise<Client> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      const retry =
        isTransientPgConnectionError(error) && attempt < maxAttempts;
      if (!retry) {
        throw error;
      }
      const delay = Math.min(
        INITIAL_DELAY_MS * 1.4 ** (attempt - 1),
        MAX_DELAY_MS,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
