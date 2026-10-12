import { NextResponse } from "next/server";
import {
  assertLocalPluggyRequest,
  parseBearerToken,
} from "@/infra/pluggy/local-guard";
import {
  mintPluggyProxySession,
  revokePluggyProxySession,
} from "@/security/pluggy-proxy-gate";
import { SESSION_IDLE_MS_DEFAULT } from "@/security/limits";
import { safeLog } from "@/security/safe-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseItemIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { itemIds?: unknown }).itemIds;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Emite token de sessão Pluggy com allowlist de itemIds. */
export async function POST(req: Request) {
  if (!assertLocalPluggyRequest(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const itemIds = parseItemIds(body);
  if (itemIds.length === 0) {
    return NextResponse.json(
      {
        error: "item_ids_missing",
        message: "Informe itemIds do cofre desbloqueado.",
      },
      { status: 400 },
    );
  }

  try {
    const minted = mintPluggyProxySession(itemIds, SESSION_IDLE_MS_DEFAULT);
    safeLog("info", "pluggy.session.mint", {
      itemCount: minted.allowedItemIds.length,
      expiresAt: minted.expiresAt,
    });
    return NextResponse.json({
      token: minted.token,
      expiresAt: minted.expiresAt,
      allowedItemIds: minted.allowedItemIds,
    });
  } catch (err) {
    safeLog("error", "pluggy.session.mint_failed", {
      message: err instanceof Error ? err.message : "fail",
    });
    return NextResponse.json(
      { error: "mint_failed", message: "Falha ao criar sessão Pluggy." },
      { status: 500 },
    );
  }
}

/** Revoga token Bearer da sessão Pluggy. */
export async function DELETE(req: Request) {
  if (!assertLocalPluggyRequest(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  const token = parseBearerToken(req);
  revokePluggyProxySession(token);
  return NextResponse.json({ ok: true });
}
