import { NextResponse } from "next/server";
import {
  parsePluggyWebhookPayload,
  processPluggyWebhookEvent,
} from "@/infra/pluggy/webhook-handlers";
import { timingSafeEqualString } from "@/security/timing-safe";
import { safeLog } from "@/security/safe-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receptor de webhooks Pluggy (HTTPS público via ngrok / túnel).
 * Responde 2XX imediatamente; processa em background.
 *
 * Segurança opcional: configure no Dashboard Pluggy um header
 * `Authorization: Bearer <segredo>` e defina o mesmo valor em
 * PLUGGY_WEBHOOK_SECRET no process.env (nunca no browser).
 *
 * Credenciais da API (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET) não entram aqui.
 */

function assertWebhookSecret(req: Request): boolean {
  const expected = process.env.PLUGGY_WEBHOOK_SECRET?.trim();
  if (!expected) {
    // Sem secret configurado: aceita (útil em dev com RequestCatcher/ngrok).
    return true;
  }
  const auth = req.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(\S+)/i.exec(auth.trim())?.[1] ?? "";
  const headerSecret =
    req.headers.get("x-pluggy-webhook-secret")?.trim() || bearer;
  return timingSafeEqualString(headerSecret, expected);
}

export async function POST(req: Request) {
  if (!assertWebhookSecret(req)) {
    // 401 não é retentado pela Pluggy — use só se o secret estiver errado de propósito.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    // Payload inválido: 400 (Pluggy não retenta).
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = parsePluggyWebhookPayload(raw);
  if (!event) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Ack imediato — processamento leve em microtask (não bloqueia o 2XX).
  queueMicrotask(() => {
    void processPluggyWebhookEvent(event).catch((err) => {
      safeLog("error", "pluggy.webhook.process_failed", {
        eventId: event.eventId,
        message: err instanceof Error ? err.message : "fail",
      });
    });
  });

  safeLog("info", "pluggy.webhook.received", {
    event: event.event,
    eventId: event.eventId,
    hasItemId: Boolean(event.itemId),
  });

  return NextResponse.json({ received: true });
}
