/** Espelho dos limites no runtime (sem import TS). */
export const AI_SESSION_TTL_MS = Number(
  process.env.GF_AI_SESSION_TTL_MS || 60 * 60_000,
);
export const AI_CONTEXT_MAX_BYTES = 40_000;
export const FINANCIAL_CONTEXT_ALLOWED_KEYS = new Set([
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
]);
