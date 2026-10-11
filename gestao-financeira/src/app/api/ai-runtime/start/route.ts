import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_ORIGIN_OK = new Set([
  "http://127.0.0.1:43127",
  "http://localhost:43127",
]);

const AI_URL = process.env.GF_AI_URL || "http://127.0.0.1:43128";

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

async function runtimeHealthy(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${AI_URL}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { runtime?: string };
    return body.runtime === "ready" || body.runtime === "unavailable";
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function resolveRuntimeEntry(): string | null {
  const candidates = [
    path.join(process.cwd(), "local-ai-runtime", "src", "index.js"),
    path.join(process.cwd(), "runtime", "ai-runtime", "index.js"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function POST(req: Request) {
  if (!assertLocal(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  if (await runtimeHealthy()) {
    return NextResponse.json({
      ok: true,
      alreadyRunning: true,
      message: "Runtime já está respondendo em 127.0.0.1:43128",
    });
  }

  const entry = resolveRuntimeEntry();
  if (!entry) {
    return NextResponse.json(
      {
        ok: false,
        error: "runtime_entry_missing",
        message:
          "Não encontrei local-ai-runtime. Rode npm run ai:runtime na pasta do projeto.",
      },
      { status: 500 },
    );
  }

  try {
    const child = spawn(process.execPath, [entry], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        GF_AI_PORT: "43128",
        GF_AI_HOST: "127.0.0.1",
        GF_AI_ORIGINS: "http://127.0.0.1:43127,http://localhost:43127",
      },
    });
    child.unref();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "spawn_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  // Aguarda o health ficar disponível
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    if (await runtimeHealthy()) {
      return NextResponse.json({
        ok: true,
        alreadyRunning: false,
        message: "Local AI Runtime iniciado em 127.0.0.1:43128",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    alreadyRunning: false,
    pending: true,
    message:
      "Processo iniciado; ainda aquecendo. Aguarde e clique em Diagnosticar de novo. Confirme também se o Ollama está aberto.",
  });
}
