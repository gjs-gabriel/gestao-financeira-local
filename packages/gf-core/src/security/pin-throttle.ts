/**
 * Contador de tentativas de PIN com backoff — só em memória.
 * Nunca grava PIN nem hash em storage.
 */

import {
  PIN_BASE_BACKOFF_MS,
  PIN_LOCKOUT_MS,
  PIN_MAX_ATTEMPTS,
  PIN_MAX_BACKOFF_MS,
} from "./limits";

export type PinThrottleState = {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
};

const byVault = new Map<string, PinThrottleState>();

function state(vaultId: string): PinThrottleState {
  let s = byVault.get(vaultId);
  if (!s) {
    s = { failures: 0, lockedUntil: 0, lastFailureAt: 0 };
    byVault.set(vaultId, s);
  }
  return s;
}

export function getPinThrottleStatus(vaultId: string, now = Date.now()): {
  blocked: boolean;
  retryAfterMs: number;
  failures: number;
  message?: string;
} {
  const s = state(vaultId);
  if (s.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterMs: s.lockedUntil - now,
      failures: s.failures,
      message: `Cofre temporariamente bloqueado. Tente de novo em ${Math.ceil((s.lockedUntil - now) / 1000)}s.`,
    };
  }
  if (s.failures > 0 && s.lastFailureAt > 0) {
    const backoff = Math.min(
      PIN_MAX_BACKOFF_MS,
      PIN_BASE_BACKOFF_MS * 2 ** Math.min(s.failures - 1, 8),
    );
    const until = s.lastFailureAt + backoff;
    if (until > now) {
      return {
        blocked: true,
        retryAfterMs: until - now,
        failures: s.failures,
        message: `Aguarde ${Math.ceil((until - now) / 1000)}s antes de tentar novamente.`,
      };
    }
  }
  return { blocked: false, retryAfterMs: 0, failures: s.failures };
}

export function recordPinFailure(vaultId: string, now = Date.now()): PinThrottleState {
  const s = state(vaultId);
  s.failures += 1;
  s.lastFailureAt = now;
  if (s.failures >= PIN_MAX_ATTEMPTS) {
    s.lockedUntil = now + PIN_LOCKOUT_MS;
  }
  return { ...s };
}

export function clearPinFailures(vaultId: string): void {
  byVault.delete(vaultId);
}

export function clearAllPinThrottles(): void {
  byVault.clear();
}

/** Exposto para testes. */
export function __pinThrottleForTests(): Map<string, PinThrottleState> {
  return byVault;
}
