import { safeLog } from "@/security/safe-log";
import {
  markItemError,
  markItemNeedsSync,
  rememberWebhookEvent,
} from "./webhook-inbox";
import type {
  PluggyWebhookAction,
  PluggyWebhookError,
  PluggyWebhookEvent,
  PluggyWebhookEventName,
} from "./webhook-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function parsePluggyWebhookPayload(
  raw: unknown,
): PluggyWebhookEvent | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const event = typeof obj.event === "string" ? obj.event : null;
  const eventId = typeof obj.eventId === "string" ? obj.eventId : null;
  if (!event || !eventId) return null;

  const errorObj = asRecord(obj.error);
  const error: PluggyWebhookError | undefined = errorObj
    ? {
        code: typeof errorObj.code === "string" ? errorObj.code : undefined,
        message:
          typeof errorObj.message === "string"
            ? errorObj.message
            : typeof errorObj.description === "string"
              ? errorObj.description
              : undefined,
        parameter:
          typeof errorObj.parameter === "string"
            ? errorObj.parameter
            : undefined,
      }
    : undefined;

  return {
    event: event as PluggyWebhookEventName,
    eventId,
    itemId: typeof obj.itemId === "string" ? obj.itemId : undefined,
    clientUserId:
      typeof obj.clientUserId === "string" ? obj.clientUserId : undefined,
    triggeredBy:
      typeof obj.triggeredBy === "string" ? obj.triggeredBy : undefined,
    accountId: typeof obj.accountId === "string" ? obj.accountId : undefined,
    error,
    receivedAt: new Date().toISOString(),
  };
}

export function actionForWebhookEvent(
  event: PluggyWebhookEventName,
): PluggyWebhookAction {
  switch (event) {
    case "item/created":
    case "item/updated":
    case "item/login_succeeded":
    case "transactions/created":
    case "transactions/updated":
      return "sync_item";
    case "item/error":
      return "note_error";
    default:
      return "ignore";
  }
}

/** Processamento leve pós-ack (não bloqueia a resposta HTTP). */
export async function handleItemCreated(itemId: string): Promise<void> {
  markItemNeedsSync(itemId);
  safeLog("info", "pluggy.webhook.item_created", { itemId });
}

export async function handleItemUpdated(itemId: string): Promise<void> {
  markItemNeedsSync(itemId);
  safeLog("info", "pluggy.webhook.item_updated", { itemId });
}

export async function handleItemError(
  itemId: string,
  error?: PluggyWebhookError,
): Promise<void> {
  markItemError(itemId, {
    code: error?.code,
    message: error?.message ?? error?.description,
  });
  safeLog("warn", "pluggy.webhook.item_error", {
    itemId,
    code: error?.code,
    message: error?.message ?? error?.description,
  });
}

/**
 * Despacha o evento após responder 2XX ao Pluggy.
 * Trabalho pesado (fetch + merge no .gfin) fica no client via poll da inbox.
 */
export async function processPluggyWebhookEvent(
  event: PluggyWebhookEvent,
): Promise<void> {
  const { duplicate } = rememberWebhookEvent(event);
  if (duplicate) {
    safeLog("info", "pluggy.webhook.duplicate", { eventId: event.eventId });
    return;
  }

  const action = actionForWebhookEvent(event.event);
  const itemId = event.itemId?.trim();

  switch (action) {
    case "sync_item":
      if (itemId) {
        if (event.event === "item/created") await handleItemCreated(itemId);
        else await handleItemUpdated(itemId);
      }
      break;
    case "note_error":
      if (itemId) await handleItemError(itemId, event.error);
      break;
    default:
      safeLog("info", "pluggy.webhook.ignored", {
        event: event.event,
        eventId: event.eventId,
      });
  }
}
