import { NextResponse } from "next/server";
import {
  assertLocalPluggyRequest,
  parseBearerToken,
} from "@/infra/pluggy/local-guard";
import {
  getItemWebhookError,
  listRecentWebhookEvents,
  peekPendingSyncItemIds,
  takePendingSyncItemIds,
} from "@/infra/pluggy/webhook-inbox";
import { getPluggyProxySession } from "@/security/pluggy-proxy-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll localhost do inbox de webhooks (após unlock).
 * GET — lista pending; ?consume=1 remove da fila.
 */
export async function GET(req: Request) {
  if (!assertLocalPluggyRequest(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  const token = parseBearerToken(req);
  if (!token || !getPluggyProxySession(token)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Sessão Pluggy do cofre necessária (Bearer).",
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const consume = url.searchParams.get("consume") === "1";
  const pendingItemIds = consume
    ? takePendingSyncItemIds()
    : peekPendingSyncItemIds();

  const errors = Object.fromEntries(
    pendingItemIds
      .map((id) => [id, getItemWebhookError(id)] as const)
      .filter(([, err]) => err != null),
  );

  return NextResponse.json({
    pendingItemIds,
    errors,
    recent: listRecentWebhookEvents(10).map((e) => ({
      event: e.event,
      eventId: e.eventId,
      itemId: e.itemId,
      receivedAt: e.receivedAt,
    })),
  });
}
