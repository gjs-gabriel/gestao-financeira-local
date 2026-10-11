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

const OLLAMA_URL = process.env.GF_OLLAMA_URL || "http://127.0.0.1:11434";

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

async function ollamaHealthy(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function resolveOllamaExe(): string | null {
  const candidates = [
    process.env.OLLAMA_PATH,
    path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "Ollama",
      "ollama.exe",
    ),
    path.join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Ollama",
      "ollama.exe",
    ),
    "ollama",
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (c === "ollama") return c;
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function POST(req: Request) {
  if (!assertLocal(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  if (await ollamaHealthy()) {
    return NextResponse.json({
      ok: true,
      alreadyRunning: true,
      message: "Ollama já está respondendo em 127.0.0.1:11434",
    });
  }

  const exe = resolveOllamaExe();
  if (!exe) {
    return NextResponse.json(
      {
        ok: false,
        error: "ollama_not_installed",
        message:
          "Ollama não encontrado no PC. Instale em https://ollama.com/download",
      },
      { status: 500 },
    );
  }

  try {
    // `serve` sobe a API; no Windows o app de bandeja às vezes fica sem servidor.
    const child = spawn(exe, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env },
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

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await ollamaHealthy()) {
      return NextResponse.json({
        ok: true,
        alreadyRunning: false,
        message:
          "Ollama iniciado (API em 127.0.0.1:11434). Agora baixe o modelo se faltar e use Conectar.",
      });
    }
  }

  return NextResponse.json({
    ok: false,
    pending: true,
    message:
      "Ollama está instalado, mas a API não subiu em 20s. Feche o ícone da bandeja, abra de novo o app Ollama e clique em Diagnosticar. Se persistir: reinicie o PC ou rode no terminal: ollama serve",
  });
}
