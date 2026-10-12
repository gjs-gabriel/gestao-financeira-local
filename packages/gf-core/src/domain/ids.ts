/** IDs estáveis — módulo sem dependências (evita ciclo snapshot↔migrate). */
export function createId(prefix = "id"): string {
  try {
    const c =
      typeof globalThis !== "undefined"
        ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
        : undefined;
    if (c && typeof c.randomUUID === "function") {
      return `${prefix}_${c.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
