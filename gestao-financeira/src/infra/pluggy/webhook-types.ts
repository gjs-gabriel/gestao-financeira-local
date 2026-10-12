/** Payload mínimo dos webhooks Pluggy (item/*). */

export type PluggyWebhookEventName =
  | "item/created"
  | "item/updated"
  | "item/deleted"
  | "item/error"
  | "item/waiting_user_input"
  | "item/waiting_user_action"
  | "item/login_succeeded"
  | "transactions/created"
  | "transactions/updated"
  | "transactions/deleted"
  | "connector/status_updated"
  | string;

export interface PluggyWebhookError {
  code?: string;
  message?: string;
  parameter?: string;
  title?: string;
  description?: string;
  detail?: string;
}

export interface PluggyWebhookEvent {
  event: PluggyWebhookEventName;
  eventId: string;
  itemId?: string;
  clientUserId?: string;
  triggeredBy?: string;
  accountId?: string;
  error?: PluggyWebhookError;
  receivedAt: string;
}

export type PluggyWebhookAction =
  | "sync_item"
  | "note_error"
  | "ignore";
