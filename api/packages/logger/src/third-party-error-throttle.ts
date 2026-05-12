import { getEnvNumber } from '@lumimax/config';

export interface ThirdPartyErrorThrottleOptions {
  throttleMs?: number;
}

export interface ThirdPartyErrorThrottleResult {
  shouldLog: boolean;
  suppressedCount: number;
}

interface ErrorSlot {
  nextLogAt: number;
  suppressed: number;
}

const DEFAULT_THROTTLE_MS = 10_000;

export class ThirdPartyErrorThrottle {
  private readonly slots = new Map<string, ErrorSlot>();
  private readonly throttleMs: number;

  constructor(options: ThirdPartyErrorThrottleOptions = {}) {
    const raw =
      options.throttleMs
      ?? getEnvNumber('LOG_THIRD_PARTY_ERROR_THROTTLE_MS', DEFAULT_THROTTLE_MS);
    this.throttleMs = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_THROTTLE_MS;
  }

  hit(key: string): ThirdPartyErrorThrottleResult {
    const now = Date.now();
    const slot = this.slots.get(key);

    if (!slot || now >= slot.nextLogAt) {
      const suppressedCount = slot?.suppressed ?? 0;
      this.slots.set(key, { nextLogAt: now + this.throttleMs, suppressed: 0 });
      return { shouldLog: true, suppressedCount };
    }

    slot.suppressed += 1;
    return { shouldLog: false, suppressedCount: slot.suppressed };
  }

  clear(key: string): void {
    this.slots.delete(key);
  }
}
