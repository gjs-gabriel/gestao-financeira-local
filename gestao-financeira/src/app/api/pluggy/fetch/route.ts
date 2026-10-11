import { NextResponse } from "next/server";
import { createPluggyClient, PluggyHttpError } from "@/infra/pluggy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_ORIGIN_OK = new Set([
  "http://127.0.0.1:43127",
  "http://localhost:43127",
]);

function assertLocal(req: Request): boolean {
  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin") || "";
  if (origin && !APP_ORIGIN_OK.has(origin)) return false;
  return (
    host.startsWith("127.0.0.1:") ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host === "localhost"
  );
}

function parseItemIds(body: unknown, envFallback: string | undefined): string[] {
  const fromEnv = (envFallback ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!body || typeof body !== "object") return fromEnv;
  const raw = (body as { itemIds?: unknown }).itemIds;
  if (!Array.isArray(raw)) return fromEnv;
  const fromBody = raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
  return fromBody.length > 0 ? fromBody : fromEnv;
}

export async function POST(req: Request) {
  if (!assertLocal(req)) {
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

  const itemIds = parseItemIds(body, process.env.PLUGGY_ITEM_IDS);
  if (itemIds.length === 0) {
    return NextResponse.json(
      {
        error: "item_ids_missing",
        message:
          "Informe itemIds no body ou configure PLUGGY_ITEM_IDS no ambiente.",
      },
      { status: 400 },
    );
  }

  try {
    const client = createPluggyClient({ clientId, clientSecret });
    const bundle = await client.fetchItemsBundle(itemIds);
    return NextResponse.json(bundle);
  } catch (err) {
    if (err instanceof PluggyHttpError) {
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
    return NextResponse.json(
      {
        error: "pluggy_fetch_failed",
        message: err instanceof Error ? err.message : "Falha ao buscar Pluggy",
      },
      { status: 502 },
    );
  }
}
