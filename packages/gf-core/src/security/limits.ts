/**
 * Limites e políticas de segurança centralizados.
 * Entradas de arquivo/IA/chat são sempre não confiáveis.
 */

/** PBKDF2 — compatível com cofres legítimos (310_000). */
export const KDF_ITERATIONS_MIN = 100_000;
export const KDF_ITERATIONS_MAX = 1_000_000;
export const KDF_SALT_BYTES = 16;
export const KDF_IV_BYTES = 12;
export const KDF_MAX_CIPHERTEXT_BYTES = 32 * 1024 * 1024;

/** PIN / sessão */
/** Cofres novos (pessoal/admin). Demo Marina pode usar PIN legado mais curto. */
export const PIN_MIN_LENGTH = 6;
/** Unlock / cofres legados — ainda aceitam PIN curto já existente. */
export const PIN_MIN_LENGTH_LEGACY = 4;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_BASE_BACKOFF_MS = 2_000;
export const PIN_MAX_BACKOFF_MS = 60_000;
export const PIN_LOCKOUT_MS = 5 * 60_000;

export function assertNewVaultPin(pin: string): void {
  if (pin.length < PIN_MIN_LENGTH) {
    throw new Error(`O PIN deve ter pelo menos ${PIN_MIN_LENGTH} caracteres`);
  }
}
/** @deprecated use PIN_BASE_BACKOFF_MS */
export const PIN_LOCKOUT_BASE_MS = PIN_BASE_BACKOFF_MS;
/** @deprecated use PIN_LOCKOUT_MS */
export const PIN_LOCKOUT_MAX_MS = PIN_LOCKOUT_MS;

export const SESSION_IDLE_MS_DEFAULT = 15 * 60_000;
export const SESSION_IDLE_MS_MIN = 60_000;
export const SESSION_IDLE_MS_MAX = 4 * 60 * 60_000;

export function clampIdleMs(ms: number): number {
  if (!Number.isFinite(ms)) return SESSION_IDLE_MS_DEFAULT;
  return Math.min(SESSION_IDLE_MS_MAX, Math.max(SESSION_IDLE_MS_MIN, ms));
}

/** Importação */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_CELLS = 200_000;
export const MAX_IMPORT_STRING_CHARS = 2_000;
export const MAX_CSV_CHARS = 8 * 1024 * 1024;
export const MAX_PDF_PAGES = 80;
export const MAX_PDF_TEXT_CHARS = 1_500_000;

/** Aliases usados pelos parsers */
export const IMPORT_MAX_FILE_BYTES = MAX_FILE_BYTES;
export const IMPORT_MAX_ROWS = MAX_IMPORT_ROWS;
export const IMPORT_MAX_CELLS = MAX_IMPORT_CELLS;
export const IMPORT_MAX_STRING_CHARS = MAX_IMPORT_STRING_CHARS;

/** IA — token de sessão */
export const AI_SESSION_TTL_MS = 60 * 60_000;
export const AI_CONTEXT_MAX_BYTES = 40_000;

export const FINANCIAL_CONTEXT_ALLOWED_KEYS = [
  "version",
  "intent",
  "period",
  "summary",
  "expensesByCategory",
  "investments",
  "debts",
  "goals",
  "trends",
  "extras",
  "question",
] as const;
