/**
 * Inbox in-memory de webhooks Pluggy.
 * O servidor não abre o cofre (.gfin); só marca itemIds que o client deve re-sincronizar.
 */

import type { PluggyWebhookEvent } from "./webhook-types";

const MAX_EVENTS = 200;
const seenEventIds = new Set<string>();
const events: PluggyWebhookEvent[] = [];
/** itemIds que pedem sync forçado no próximo poll do client. */
const pendingSyncItemIds = new Set<string>();
const lastErrors = new Map<
  string,
  { code?: string; message?: string; at: string }
>();

export function rememberWebhookEvent(event: PluggyWebhookEvent): {
  duplicate: boolean;
} {
  if (event.eventId && seenEventIds.has(event.eventId)) {
    return { duplicate: true };
  }
  if (event.eventId) {
    seenEventIds.add(event.eventId);
    if (seenEventIds.size > MAX_EVENTS * 2) {
      // poda simples: limpa metade antiga
      const keep = [...seenEventIds].slice(-MAX_EVENTS);
      seenEventIds.clear();
      for (const id of keep) seenEventIds.add(id);
    }
  }
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  return { duplicate: false };
}

export function markItemNeedsSync(itemId: string): void {
  const id = itemId.trim();
  if (!id) return;
  pendingSyncItemIds.add(id);
}

export function markItemError(
  itemId: string,
  error?: { code?: string; message?: string },
): void {
  const id = itemId.trim();
  if (!id) return;
  lastErrors.set(id, {
    code: error?.code,
    message: error?.message,
    at: new Date().toISOString(),
  });
}

/** Consome a fila de sync (ids únicos) — o client puxa e limpa. */
export function takePendingSyncItemIds(): string[] {
  const ids = [...pendingSyncItemIds];
  pendingSyncItemIds.clear();
  return ids;
}

export function peekPendingSyncItemIds(): string[] {
  return [...pendingSyncItemIds];
}

export function getItemWebhookError(itemId: string) {
  return lastErrors.get(itemId) ?? null;
}

export function listRecentWebhookEvents(limit = 20): PluggyWebhookEvent[] {
  return events.slice(-Math.max(1, limit));
}

/** Só testes. */
export function __resetPluggyWebhookInboxForTests(): void {
  seenEventIds.clear();
  events.length = 0;
  pendingSyncItemIds.clear();
  lastErrors.clear();
}
