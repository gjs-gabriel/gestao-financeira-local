import { NextResponse } from "next/server";
import { createPluggyClient, PluggyHttpError } from "@/infra/pluggy";
import {
  assertLocalPluggyRequest,
  parseBearerToken,
} from "@/infra/pluggy/local-guard";
import { assertPluggyFetchAccess } from "@/security/pluggy-proxy-gate";
import { safeLog } from "@/security/safe-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseItemIdsFromBody(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { itemIds?: unknown }).itemIds;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  if (!assertLocalPluggyRequest(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "credentials_missing",
        message:
          "Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente do servidor.",
      },
      { status: 503 },
    );
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const token = parseBearerToken(req);
  const access = assertPluggyFetchAccess(token, parseItemIdsFromBody(body), {
    envFallbackIds: (process.env.PLUGGY_ITEM_IDS ?? "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  });

  if (!access.ok) {
    return NextResponse.json(
      { error: access.error, message: access.message },
      { status: access.status },
    );
  }

  try {
    const client = createPluggyClient({ clientId, clientSecret });
    const bundle = await client.fetchItemsBundle(access.itemIds);
    safeLog("info", "pluggy.fetch.ok", {
      itemCount: access.itemIds.length,
      fetchedAt: bundle.fetchedAt,
    });
    return NextResponse.json(bundle);
  } catch (err) {
    if (err instanceof PluggyHttpError) {
      safeLog("warn", "pluggy.fetch.http_error", {
        status: err.status,
        code: err.code,
        message: err.message,
      });
      return NextResponse.json(
        {
          error: "pluggy_http_error",
          message: err.message,
          status: err.status,
          code: err.code,
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    safeLog("error", "pluggy.fetch.failed", {
      message: err instanceof Error ? err.message : "Falha ao buscar Pluggy",
    });
    return NextResponse.json(
      {
        error: "pluggy_fetch_failed",
        message: err instanceof Error ? err.message : "Falha ao buscar Pluggy",
      },
      { status: 502 },
    );
  }
}
