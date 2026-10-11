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
const OLLAMA_URL = process.env.GF_OLLAMA_URL || "http://127.0.0.1:11434";
const PREFERRED_MODEL = process.env.GF_AI_MODEL || "qwen2.5:1.5b";
const FALLBACK_MODEL = process.env.GF_AI_FALLBACK_MODEL || "llama3.2:1b";

function ollamaExeInstalled(): boolean {
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
  ].filter(Boolean) as string[];
  return candidates.some((c) => fs.existsSync(c));
}

type Check = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  howToFix?: string;
};

async function pingJson(
  url: string,
  timeoutMs = 2500,
): Promise<{ ok: boolean; status?: number; body?: unknown; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

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

export async function GET(req: Request) {
  if (!assertLocal(req)) {
    return NextResponse.json({ error: "localhost_only" }, { status: 403 });
  }

  const checks: Check[] = [];

  const ollama = await pingJson(`${OLLAMA_URL}/api/tags`);
  const ollamaModels: string[] = [];
  if (ollama.ok && ollama.body && typeof ollama.body === "object") {
    const models = (ollama.body as { models?: { name?: string }[] }).models;
    if (Array.isArray(models)) {
      for (const m of models) {
        if (m?.name) ollamaModels.push(m.name);
      }
    }
  }

  const installed = ollamaExeInstalled();
  checks.push({
    id: "ollama",
    label: "Ollama em execução (porta 11434)",
    ok: ollama.ok,
    detail: ollama.ok
      ? `Respondendo em ${OLLAMA_URL}`
      : installed
        ? "Ollama está instalado no PC, mas a API não responde em 11434 (app aberto sem servidor, ou travado)."
        : `Não alcançável: ${ollama.error || `HTTP ${ollama.status}`}`,
    howToFix: ollama.ok
      ? undefined
      : installed
        ? "Use o botão Iniciar Ollama, ou feche o ícone da bandeja e abra de novo. Alternativa: ollama serve"
        : "Instale em https://ollama.com/download e abra o app Ollama",
  });

  function modelMatches(installed: string, wanted: string): boolean {
    const base = wanted.split(":")[0] ?? wanted;
    return (
      installed === wanted ||
      installed.startsWith(`${wanted}:`) ||
      installed === base ||
      installed.startsWith(`${base}:`)
    );
  }

  const picked =
    ollamaModels.find((n) => modelMatches(n, PREFERRED_MODEL)) ??
    ollamaModels.find((n) => modelMatches(n, FALLBACK_MODEL)) ??
    null;
  const modelOk = Boolean(picked);
  const hasAnyModel = ollamaModels.length > 0;

  checks.push({
    id: "model",
    label: `Modelo instalado (${PREFERRED_MODEL} ou ${FALLBACK_MODEL})`,
    ok: modelOk,
    detail: !ollama.ok
      ? "Depende do Ollama estar no ar"
      : modelOk
        ? `Encontrado: ${picked}`
        : hasAnyModel
          ? `Modelos no Ollama: ${ollamaModels.slice(0, 6).join(", ")} — nenhum é o preferido/fallback`
          : "Nenhum modelo listado no Ollama",
    howToFix: modelOk
      ? undefined
      : `No terminal: ollama pull ${PREFERRED_MODEL}`,
  });

  const health = await pingJson(`${AI_URL}/health`);
  let healthBody: {
    runtime?: string;
    modelReady?: boolean;
    model?: string | null;
    status?: string;
  } | null = null;
  if (health.ok && health.body && typeof health.body === "object") {
    healthBody = health.body as typeof healthBody;
  }

  const processUp = health.ok;
  const runtimeLinked =
    healthBody?.runtime === "ready" || healthBody?.status === "ok";

  checks.push({
    id: "runtime",
    label: "Local AI Runtime (porta 43128)",
    ok: processUp,
    detail: processUp
      ? runtimeLinked
        ? `No ar e ligado ao Ollama — modelo: ${healthBody?.model ?? "—"}`
        : `Processo no ar, mas Ollama indisponível (runtime=${healthBody?.runtime})`
      : `Não alcançável: ${health.error || `HTTP ${health.status}`}`,
    howToFix: processUp
      ? undefined
      : "No projeto: npm run ai:runtime — ou use o botão Iniciar runtime nesta página",
  });

  checks.push({
    id: "model_ready",
    label: "Runtime enxerga um modelo pronto",
    ok: Boolean(healthBody?.modelReady),
    detail: healthBody?.modelReady
      ? `modelReady=true (${healthBody.model})`
      : "modelReady=false — Ollama sem modelo compatível ou runtime offline",
    howToFix: healthBody?.modelReady
      ? undefined
      : `Com Ollama no ar: ollama pull ${PREFERRED_MODEL} e use Iniciar runtime / Diagnosticar`,
  });

  const ready = checks.every((c) => c.ok);

  return NextResponse.json({
    ready,
    preferredModel: PREFERRED_MODEL,
    fallbackModel: FALLBACK_MODEL,
    endpoints: {
      app: "http://127.0.0.1:43127",
      aiRuntime: AI_URL,
      ollama: OLLAMA_URL,
    },
    ollamaModels,
    checks,
    ollamaInstalled: installed,
    tip: ready
      ? "Tudo certo. No app, use Conectar / Executar teste."
      : installed && !ollama.ok
        ? "Ollama está instalado, mas o serviço (porta 11434) não está no ar — por isso aparece “não encontrado”. Inicie o Ollama e depois Conectar."
        : "Só abrir o Ollama não basta: o app fala com o Local AI Runtime (43128), que por sua vez usa o Ollama (11434).",
  });
}
