const REDACTED_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'reauthToken',
  'secret',
  'mfaCode',
  'authorization',
]);

function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k) ? '[REDACTED]' : redact(v);
  }
  return out;
}

export const logger = {
  info(message: string, meta: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), message, ...(redact(meta) as object) }));
  },
  warn(message: string, meta: Record<string, unknown> = {}): void {
    console.warn(JSON.stringify({ level: 'warn', ts: new Date().toISOString(), message, ...(redact(meta) as object) }));
  },
  error(message: string, meta: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), message, ...(redact(meta) as object) }));
  },
};
