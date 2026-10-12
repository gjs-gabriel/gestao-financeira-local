/**
 * Logger defensivo — nunca serializa PIN, secrets, snapshot ou ciphertext.
 */

const REDACT_KEY =
  /pin|password|senha|secret|apiKey|apikey|ciphertext|snapshot|clientSecret|authorization|bearer|vaultKey|envelope/i;

function scrubValue(key: string, value: unknown): unknown {
  if (REDACT_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (value.length > 120) return `${value.slice(0, 80)}…[truncated]`;
    return value;
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      return `[array:${value.length}]`;
    }
    return "[object]";
  }
  return value;
}

export function scrubLogMeta(
  meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = scrubValue(k, v);
  }
  return out;
}

export function safeLog(
  level: "info" | "warn" | "error",
  label: string,
  meta?: Record<string, unknown>,
): void {
  const scrubbed = scrubLogMeta(meta);
  if (level === "error") {
    if (scrubbed) console.error(label, scrubbed);
    else console.error(label);
    return;
  }
  if (level === "warn") {
    if (scrubbed) console.warn(label, scrubbed);
    else console.warn(label);
    return;
  }
  if (scrubbed) console.info(label, scrubbed);
  else console.info(label);
}
