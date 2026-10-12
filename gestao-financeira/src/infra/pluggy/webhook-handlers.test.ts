import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  actionForWebhookEvent,
  parsePluggyWebhookPayload,
  processPluggyWebhookEvent,
} from "./webhook-handlers";
import {
  __resetPluggyWebhookInboxForTests,
  peekPendingSyncItemIds,
  takePendingSyncItemIds,
  getItemWebhookError,
} from "./webhook-inbox";

describe("pluggy webhook handlers", () => {
  beforeEach(() => {
    __resetPluggyWebhookInboxForTests();
  });

  it("parseia item/created e marca sync", async () => {
    const parsed = parsePluggyWebhookPayload({
      event: "item/created",
      eventId: "evt-1",
      itemId: "item-abc",
      clientUserId: "user-1",
      triggeredBy: "USER",
    });
    assert.ok(parsed);
    assert.equal(parsed!.event, "item/created");
    assert.equal(actionForWebhookEvent(parsed!.event), "sync_item");

    await processPluggyWebhookEvent(parsed!);
    assert.deepEqual(peekPendingSyncItemIds(), ["item-abc"]);
    assert.deepEqual(takePendingSyncItemIds(), ["item-abc"]);
    assert.deepEqual(peekPendingSyncItemIds(), []);
  });

  it("deduplica pelo eventId", async () => {
    const payload = {
      event: "item/updated",
      eventId: "evt-dup",
      itemId: "item-1",
    };
    const a = parsePluggyWebhookPayload(payload)!;
    const b = parsePluggyWebhookPayload(payload)!;
    await processPluggyWebhookEvent(a);
    await processPluggyWebhookEvent(b);
    assert.deepEqual(takePendingSyncItemIds(), ["item-1"]);
  });

  it("item/error registra falha sem sync", async () => {
    const parsed = parsePluggyWebhookPayload({
      event: "item/error",
      eventId: "evt-err",
      itemId: "item-err",
      error: { code: "USER_INPUT_TIMEOUT", message: "expired" },
    });
    assert.ok(parsed);
    assert.equal(actionForWebhookEvent(parsed!.event), "note_error");
    await processPluggyWebhookEvent(parsed!);
    assert.deepEqual(peekPendingSyncItemIds(), []);
    const err = getItemWebhookError("item-err");
    assert.equal(err?.code, "USER_INPUT_TIMEOUT");
  });
});
