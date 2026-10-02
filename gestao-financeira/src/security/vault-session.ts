/**
 * Segredos de sessão do cofre — somente memória de processo.
 * NÃO usar React state / localStorage / sessionStorage / IndexedDB.
 */

type SessionHolder = {
  vaultId: string;
  /** PIN em memória só enquanto desbloqueado — limpar no lock. */
  pin: string;
  unlockedAt: number;
  lastActivityAt: number;
};

let session: SessionHolder | null = null;
let idleMs = 15 * 60_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let onIdleLock: (() => void) | null = null;

export function setSessionIdleHandler(handler: (() => void) | null): void {
  onIdleLock = handler;
}

export function setSessionIdleMs(ms: number): void {
  idleMs = ms;
  bumpSessionActivity();
}

export function getSessionIdleMs(): number {
  return idleMs;
}

/** Força disparo do idle lock (testes / ambientes sem window). */
export function __triggerIdleLockForTests(): void {
  clearVaultSession();
  onIdleLock?.();
}

export function establishVaultSession(vaultId: string, pin: string): void {
  clearVaultSession();
  session = {
    vaultId,
    pin,
    unlockedAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  scheduleIdle();
}

export function getSessionPin(vaultId?: string): string | null {
  if (!session) return null;
  if (vaultId && session.vaultId !== vaultId) return null;
  return session.pin;
}

export function hasVaultSession(vaultId?: string): boolean {
  if (!session) return false;
  if (vaultId) return session.vaultId === vaultId;
  return true;
}

export function bumpSessionActivity(): void {
  if (!session) return;
  session.lastActivityAt = Date.now();
  scheduleIdle();
}

export function clearVaultSession(): void {
  if (session) {
    // Sobrescrever string na medida do possível (imutabilidade de string JS limita)
    session.pin = "";
    session.vaultId = "";
  }
  session = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (!session || typeof window === "undefined") return;
  idleTimer = setTimeout(() => {
    clearVaultSession();
    onIdleLock?.();
  }, idleMs);
}

/** Testes */
export function __sessionForTests(): SessionHolder | null {
  return session;
}
