import { NextResponse } from "next/server";
import { createPluggyClient, PluggyHttpError } from "@/infra/pluggy";
import { assertLocalPluggyRequest } from "@/infra/pluggy/local-guard";
import { safeLog } from "@/security/safe-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emite um Connect Token (escopo limitado) para o Pluggy Connect no frontend.
 * CLIENT_ID / CLIENT_SECRET nunca saem do servidor — use PLUGGY_CLIENT_ID e
 * PLUGGY_CLIENT_SECRET no process.env (.env.local / launcher).
 */
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
          "Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente do servidor (nunca no browser).",
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

  const clientUserId =
    body &&
    typeof body === "object" &&
    typeof (body as { clientUserId?: unknown }).clientUserId === "string"
      ? (body as { clientUserId: string }).clientUserId.trim()
      : undefined;
  const itemId =
    body &&
    typeof body === "object" &&
    typeof (body as { itemId?: unknown }).itemId === "string"
      ? (body as { itemId: string }).itemId.trim()
      : undefined;

  const webhookUrl = process.env.PLUGGY_WEBHOOK_PUBLIC_URL?.trim() || undefined;

  try {
    const pluggy = createPluggyClient({ clientId, clientSecret });
    const connectToken = await pluggy.createConnectToken({
      clientUserId: clientUserId || undefined,
      itemId: itemId || undefined,
      webhookUrl,
    });
    safeLog("info", "pluggy.connect_token.ok", {
      hasClientUserId: Boolean(clientUserId),
      hasItemId: Boolean(itemId),
      hasWebhookUrl: Boolean(webhookUrl),
    });
    return NextResponse.json({ accessToken: connectToken.accessToken });
  } catch (err) {
    if (err instanceof PluggyHttpError) {
      safeLog("warn", "pluggy.connect_token.http_error", {
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
    safeLog("error", "pluggy.connect_token.failed", {
      message: err instanceof Error ? err.message : "fail",
    });
    return NextResponse.json(
      {
        error: "connect_token_failed",
        message:
          err instanceof Error ? err.message : "Falha ao criar Connect Token",
      },
      { status: 502 },
    );
  }
}
