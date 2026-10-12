/**
 * Guarda de tentativas de PIN — só em memória (não persiste o PIN).
 */

import {
  PIN_LOCKOUT_BASE_MS,
  PIN_LOCKOUT_MAX_MS,
  PIN_MAX_ATTEMPTS,
} from "./limits";

export interface PinGuardState {
  failures: number;
  lockedUntil: number;
}

export function createPinGuardState(): PinGuardState {
  return { failures: 0, lockedUntil: 0 };
}

export function pinGuardCanAttempt(
  state: PinGuardState,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterMs: number; message: string } {
  if (state.lockedUntil > now) {
    const retryAfterMs = state.lockedUntil - now;
    return {
      ok: false,
      retryAfterMs,
      message: `Cofre temporariamente bloqueado. Tente novamente em ${formatMs(retryAfterMs)}.`,
    };
  }
  return { ok: true };
}

export function pinGuardRegisterFailure(
  state: PinGuardState,
  now = Date.now(),
): PinGuardState {
  const failures = state.failures + 1;
  if (failures < PIN_MAX_ATTEMPTS) {
    return { failures, lockedUntil: 0 };
  }
  const excess = failures - PIN_MAX_ATTEMPTS;
  const lockMs = Math.min(
    PIN_LOCKOUT_MAX_MS,
    PIN_LOCKOUT_BASE_MS * 2 ** Math.max(0, excess),
  );
  return { failures, lockedUntil: now + lockMs };
}

export function pinGuardRegisterSuccess(): PinGuardState {
  return createPinGuardState();
}

function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return `${m} min`;
}

export { PIN_MAX_ATTEMPTS };
