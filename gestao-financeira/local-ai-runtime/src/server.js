/**
 * Servidor HTTP local do Assistente Financeiro.
 * Bind: 127.0.0.1 — Bearer token — CORS restrito.
 */

import http from "node:http";
import {
  ALLOWED_ORIGINS,
  DEFAULT_MODEL,
  DEFAULT_PORT,
  HOST,
  RUNTIME_VERSION,
  loadOrCreateToken,
  runtimeLog,
} from "./config.js";
import {
  assertSafeContext,
  buildAnalyzePrompt,
  buildChatPrompt,
  chatCompletion,
  listModels,
  ollamaReachable,
  parseAnalysisJson,
  pickInstalledModel,
} from "./ollama.js";

export function createServer() {
  const token = loadOrCreateToken();
  let busy = false;

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, { token, getBusy: () => busy, setBusy: (v) => { busy = v; } });
    } catch (e) {
      runtimeLog("request_error", { error: e instanceof Error ? e.name : "error" });
      sendJson(res, 500, { error: "internal_error" }, req);
    }
  });

  return { server, token };
}

async function handle(req, res, ctx) {
  const url = new URL(req.url || "/", `http://${HOST}:${DEFAULT_PORT}`);
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    writeCors(res, origin);
    res.writeHead(204);
    res.end();
    return;
  }

  writeCors(res, origin);

  if (url.pathname === "/health" && req.method === "GET") {
    const reachable = await ollamaReachable();
    const models = reachable ? await listModels() : [];
    const model = pickInstalledModel(models);
    sendJson(res, 200, {
      status: reachable ? "ok" : "degraded",
      runtime: reachable ? "ready" : "unavailable",
      model: model,
      modelReady: Boolean(model),
      version: RUNTIME_VERSION,
      backend: reachable ? "ollama" : null,
    });
    return;
  }

  // Pareamento: só localhost, sem Bearer (gera/retorna token do arquivo local)
  if (url.pathname === "/pair" && req.method === "GET") {
    if (!isLocalSocket(req)) {
      sendJson(res, 403, { error: "pair_localhost_only" });
      return;
    }
    sendJson(res, 200, { token: ctx.token, version: RUNTIME_VERSION });
    return;
  }

  if (url.pathname === "/shutdown" && req.method === "POST") {
    if (!requireAuth(req, res, ctx.token)) return;
    sendJson(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 200);
    return;
  }

  if (!requireAuth(req, res, ctx.token)) return;

  if (url.pathname === "/status" && req.method === "GET") {
    const reachable = await ollamaReachable();
    const models = reachable ? await listModels() : [];
    const model = pickInstalledModel(models);
    sendJson(res, 200, {
      runtime: reachable ? "running" : "stopped",
      model: {
        name: model,
        loaded: Boolean(model),
        quantization: "runtime-managed",
        contextSize: null,
      },
      backend: reachable ? "ollama-auto" : null,
      ollama: { reachable, models },
      message: reachable
        ? model
          ? undefined
          : `Nenhum modelo. Execute: ollama pull ${DEFAULT_MODEL}`
        : "Ollama inacessível em 127.0.0.1:11434",
    });
    return;
  }

  if (url.pathname === "/model" && req.method === "GET") {
    const models = await listModels();
    const model = pickInstalledModel(models);
    if (!model) {
      sendJson(res, 404, { error: "model_missing" });
      return;
    }
    sendJson(res, 200, {
      name: model,
      quantization: "runtime-managed",
      contextSize: 8192,
      sizeHint: "ver Ollama",
      minRamGb: 8,
    });
    return;
  }

  if (url.pathname === "/analyze" && req.method === "POST") {
    if (ctx.getBusy()) {
      sendJson(res, 409, { error: "busy" });
      return;
    }
    const body = await readJson(req);
    try {
      assertSafeContext(body.context);
    } catch (e) {
      sendJson(res, 400, {
        error: e instanceof Error ? e.message : "context_invalid",
      });
      return;
    }
    const models = await listModels();
    const model = pickInstalledModel(models);
    if (!model) {
      sendJson(res, 503, { error: "model_missing" });
      return;
    }
    ctx.setBusy(true);
    try {
      const text = await chatCompletion({
        model,
        userContent: buildAnalyzePrompt(body.context),
        jsonMode: true,
      });
      const analysis = parseAnalysisJson(text);
      sendJson(res, 200, { analysis });
    } catch (e) {
      const name = e instanceof Error ? e.name : "error";
      sendJson(res, 504, {
        error: name === "AbortError" ? "timeout" : "inference_failed",
      });
    } finally {
      ctx.setBusy(false);
    }
    return;
  }

  if (url.pathname === "/chat" && req.method === "POST") {
    if (ctx.getBusy()) {
      sendJson(res, 409, { error: "busy" });
      return;
    }
    const body = await readJson(req);
    try {
      assertSafeContext(body.context);
    } catch (e) {
      sendJson(res, 400, {
        error: e instanceof Error ? e.message : "context_invalid",
      });
      return;
    }
    const question = String(body.question || "").slice(0, 500);
    if (!question) {
      sendJson(res, 400, { error: "question_required" });
      return;
    }
    const models = await listModels();
    const model = pickInstalledModel(models);
    if (!model) {
      sendJson(res, 503, { error: "model_missing" });
      return;
    }
    ctx.setBusy(true);
    try {
      const text = await chatCompletion({
        model,
        userContent: buildChatPrompt(body.context, question),
        jsonMode: false,
      });
      sendJson(res, 200, { text, source: "local-runtime" });
    } catch (e) {
      const name = e instanceof Error ? e.name : "error";
      sendJson(res, 504, {
        error: name === "AbortError" ? "timeout" : "inference_failed",
      });
    } finally {
      ctx.setBusy(false);
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function requireAuth(req, res, token) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m || m[1] !== token) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

function isLocalSocket(req) {
  const addr = req.socket.remoteAddress || "";
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1"
  );
}

function writeCors(res, origin) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept",
    );
    res.setHeader("Access-Control-Max-Age", "600");
  }
  // Sem Access-Control-Allow-Origin: * jamais
}

function sendJson(res, code, obj, req) {
  if (req) writeCors(res, req.headers.origin || "");
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 512_000) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

export function startRuntime(port = DEFAULT_PORT) {
  const { server, token } = createServer();
  server.listen(port, HOST, () => {
    runtimeLog("runtime_started", {
      host: HOST,
      port,
      version: RUNTIME_VERSION,
      tokenHint: `${token.slice(0, 6)}…`,
    });
    console.info(
      `[GF-AI] Runtime em http://${HOST}:${port} (token em ~/.gestao-financeira-ai/runtime-token.txt)`,
    );
    console.info(
      `[GF-AI] Requer Ollama em ${process.env.GF_OLLAMA_URL || "http://127.0.0.1:11434"}`,
    );
    console.info(`[GF-AI] Modelo preferido: ${DEFAULT_MODEL}`);
  });
  return server;
}
