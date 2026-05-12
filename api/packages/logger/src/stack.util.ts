import { getEnvNumber } from '@lumimax/config';

export interface CompactStackOptions {
  maxLines?: number;
  filterNodeModules?: boolean;
}

const DEFAULT_MAX_LINES = 6;

export function compactStack(
  stack: string | undefined,
  options: CompactStackOptions = {},
): string[] {
  if (!stack || typeof stack !== 'string') {
    return [];
  }

  const maxLines = resolveMaxLines(options.maxLines);
  const lines = stack
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const [headline, ...frames] = lines;
  const keepNodeModules = options.filterNodeModules === false;
  const seen = new Set<string>();
  const compacted: string[] = [headline];

  for (const frame of frames) {
    const normalized = frame.trim();
    if (!normalized) {
      continue;
    }

    if (!keepNodeModules && normalized.includes('/node_modules/')) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    compacted.push(normalized);

    if (compacted.length >= maxLines) {
      break;
    }
  }

  if (compacted.length === 1) {
    for (const frame of frames.slice(0, Math.max(0, maxLines - 1))) {
      const normalized = frame.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      compacted.push(normalized);
    }
  }

  return compacted.slice(0, maxLines);
}

function resolveMaxLines(input?: number): number {
  const raw = input ?? getEnvNumber('LOG_STACK_MAX_LINES', DEFAULT_MAX_LINES);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_LINES;
  }
  return Math.max(2, Math.min(20, Math.floor(raw)));
}
