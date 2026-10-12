/**
 * Segredos de sessão do cofre — somente memória de processo.
 * NÃO usar React state / localStorage / sessionStorage / IndexedDB.
 *
 * Usa globalThis para sobreviver a Fast Refresh/HMR (senão o PIN some
 * no meio da sessão e o próximo save falha / o unlock parece “aleatório”).
 */

type SessionHolder = {
  vaultId: string;
  /** PIN em memória só enquanto desbloqueado — limpar no lock. */
  pin: string;
  /** Token opaco do proxy Pluggy (server gate) — nunca persistir. */
  pluggyProxyToken: string;
  unlockedAt: number;
  lastActivityAt: number;
};

type SessionGlobals = {
  session: SessionHolder | null;
  idleMs: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  onIdleLock: (() => void) | null;
};

const GLOBAL_KEY = "__gfin_vault_session_v1__";

function bag(): SessionGlobals {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: SessionGlobals;
  };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      session: null,
      idleMs: 15 * 60_000,
      idleTimer: null,
      onIdleLock: null,
    };
  }
  return g[GLOBAL_KEY];
}

export function setSessionIdleHandler(handler: (() => void) | null): void {
  bag().onIdleLock = handler;
}

export function setSessionIdleMs(ms: number): void {
  bag().idleMs = ms;
  bumpSessionActivity();
}

export function getSessionIdleMs(): number {
  return bag().idleMs;
}

/** Força disparo do idle lock (testes / ambientes sem window). */
export function __triggerIdleLockForTests(): void {
  const handler = bag().onIdleLock;
  if (handler) {
    handler();
  } else {
    clearVaultSession();
  }
}

export function establishVaultSession(vaultId: string, pin: string): void {
  clearVaultSession();
  // PIN já deve chegar canônico (canonicalizePin). Recusar vazio.
  if (!pin) {
    throw new Error("Sessão de cofre exige PIN.");
  }
  bag().session = {
    vaultId,
    pin,
    pluggyProxyToken: "",
    unlockedAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  scheduleIdle();
}

export function getSessionPin(vaultId?: string): string | null {
  const session = bag().session;
  if (!session) return null;
  if (vaultId && session.vaultId !== vaultId) return null;
  return session.pin;
}

export function setPluggyProxyToken(token: string | null): void {
  const session = bag().session;
  if (!session) return;
  session.pluggyProxyToken = token ?? "";
}

export function getPluggyProxyToken(vaultId?: string): string | null {
  const session = bag().session;
  if (!session) return null;
  if (vaultId && session.vaultId !== vaultId) return null;
  return session.pluggyProxyToken || null;
}

/**
 * Lê e limpa o token Pluggy da sessão (para revoke no lock sem race).
 */
export function takePluggyProxyToken(): string | null {
  const session = bag().session;
  if (!session?.pluggyProxyToken) return null;
  const token = session.pluggyProxyToken;
  session.pluggyProxyToken = "";
  return token;
}

export function hasVaultSession(vaultId?: string): boolean {
  const session = bag().session;
  if (!session) return false;
  if (vaultId) return session.vaultId === vaultId;
  return true;
}

export function bumpSessionActivity(): void {
  const session = bag().session;
  if (!session) return;
  session.lastActivityAt = Date.now();
  scheduleIdle();
}

export function clearVaultSession(): void {
  const state = bag();
  if (state.session) {
    // Sobrescrever string na medida do possível (imutabilidade de string JS limita)
    state.session.pin = "";
    state.session.vaultId = "";
    state.session.pluggyProxyToken = "";
  }
  state.session = null;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

function scheduleIdle(): void {
  const state = bag();
  if (state.idleTimer) clearTimeout(state.idleTimer);
  if (!state.session || typeof window === "undefined") return;
  state.idleTimer = setTimeout(() => {
    // Handler (wipeUnlockedMemory) revoga token Pluggy e limpa a sessão.
    const handler = bag().onIdleLock;
    if (handler) {
      handler();
    } else {
      clearVaultSession();
    }
  }, state.idleMs);
}

/** Testes */
export function __sessionForTests(): SessionHolder | null {
  return bag().session;
}
