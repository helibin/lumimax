export function formatTimestamp(date: Date = new Date()): string {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}${month}${day}.${hour}${minute}${second}.${millisecond}`;
}

export function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return '{}';
  }
}

export function formatPrettyLog(input: {
  level: string;
  message: string;
  serviceName?: string;
  contextName?: string;
  requestId?: string;
  traceId?: string;
  idLabel?: 'ReqId' | 'TraceId';
  meta?: Record<string, unknown>;
}): string {
  const timestamp = formatTimestamp();
  const token = resolveToken(input.requestId, input.traceId, input.idLabel);
  const level = `[${input.level.trim().toLowerCase()}]`;
  const scope = resolveScope(input.serviceName);
  const prefixParts = [
    timestamp,
    level,
    token,
    scope,
    input.message,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0));
  const prefix = colorizePrefix(prefixParts.join(' - '), input.level);
  const meta = formatMeta(input.meta);
  return meta ? `${prefix}\n${formatMetaBlock(meta)}` : prefix;
}

const ANSI_RESET = '\u001B[0m';
const ANSI_COLORS: Record<string, string> = {
  error: '\u001B[31m',
  warn: '\u001B[33m',
  info: '\u001B[32m',
  debug: '\u001B[36m',
};

function resolveToken(
  requestId?: string,
  traceId?: string,
  idLabel: 'ReqId' | 'TraceId' = 'TraceId',
): string | null {
  if (idLabel === 'ReqId' && requestId) {
    return `ReqId: ${requestId}`;
  }
  if (traceId) {
    return `TraceId: ${traceId}`;
  }
  if (requestId) {
    return `ReqId: ${requestId}`;
  }
  return null;
}

function resolveScope(serviceName?: string): string | null {
  if (serviceName) {
    return `(${serviceName})`;
  }
  return null;
}

function formatMetaBlock(meta: string): string {
  const lines = meta.split('\n');
  if (lines.length === 1) {
    return `>>> ${lines[0]}`;
  }
  return ['>>>', ...lines.map((line) => `    ${line}`)].join('\n');
}

function colorizePrefix(prefix: string, level: string): string {
  const color = ANSI_COLORS[level.trim().toLowerCase()];
  if (!color) {
    return prefix;
  }
  return `${color}${prefix}${ANSI_RESET}`;
}
