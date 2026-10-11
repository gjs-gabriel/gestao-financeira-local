/**
 * Servidor HTTP local do Assistente Financeiro.
 * Bind: 127.0.0.1 — sessões efêmeras — CORS restrito.
 *
 * GET /health — público local (sem segredos financeiros). Documentado.
 * POST /session — emite bearer de curta duração (localhost + Origin allowlist).
 * GET /pair — descontinuado (410); use POST /session.
 */

import http from "node:http";
import crypto from "node:crypto";
import {
  ALLOWED_ORIGINS,
  DEFAULT_MODEL,
  DEFAULT_PORT,
  HOST,
  RUNTIME_VERSION,
  SESSION_TTL_MS,
  loadOrCreateMasterKey,
  runtimeLog,
  timingSafeEqualStr,
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

/** @type {Map<string, { expiresAt: number }>} */
const sessions = new Map();

function pruneSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.expiresAt <= now) sessions.delete(k);
  }
}

function issueSession() {
  pruneSessions();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function revokeAllSessions() {
  sessions.clear();
}

export function createServer() {
  const masterKey = loadOrCreateMasterKey();
  let busy = false;

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, {
        masterKey,
        getBusy: () => busy,
        setBusy: (v) => {
          busy = v;
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      runtimeLog("request_error", {
        error: e instanceof Error ? e.name : "error",
        message: msg,
      });
      if (
        msg === "invalid_json" ||
        msg === "body_too_large" ||
        msg === "body_invalid"
      ) {
        sendJson(res, 400, { error: msg }, req);
        return;
      }
      sendJson(res, 500, { error: "internal_error", detail: msg }, req);
    }
  });

  return { server, token: masterKey };
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

  // Público: health não inclui tokens nem dados financeiros.
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

  // Sessão efêmera — exige socket local + Origin allowlist (quando presente)
  if (url.pathname === "/session" && req.method === "POST") {
    if (!isLocalSocket(req)) {
      sendJson(res, 403, { error: "session_localhost_only" });
      return;
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      sendJson(res, 403, { error: "origin_denied" });
      return;
    }
    const token = issueSession();
    runtimeLog("session_issued", { ttlMs: SESSION_TTL_MS });
    sendJson(res, 200, {
      token,
      expiresIn: Math.floor(SESSION_TTL_MS / 1000),
      version: RUNTIME_VERSION,
    });
    return;
  }

  // Pareamento antigo removido — não entrega master key
  if (url.pathname === "/pair") {
    sendJson(res, 410, {
      error: "pair_deprecated",
      message: "Use POST /session",
    });
    return;
  }

  if (url.pathname === "/shutdown" && req.method === "POST") {
    if (!requireMasterOrSession(req, res, ctx.masterKey)) return;
    // Preferir master para shutdown; sessão também pode encerrar runtime local
    revokeAllSessions();
    sendJson(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 200);
    return;
  }

  if (url.pathname === "/logout" && req.method === "POST") {
    if (!requireAuth(req, res, ctx.masterKey)) return;
    const presented = bearerFrom(req);
    if (presented) sessions.delete(presented);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!requireAuth(req, res, ctx.masterKey)) return;

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
      assertAllowedBodyKeys(body, ["context"]);
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
      assertAllowedBodyKeys(body, ["context", "question"]);
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

function assertAllowedBodyKeys(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("body_invalid");
  }
  const allow = new Set(allowed);
  for (const k of Object.keys(body)) {
    if (!allow.has(k)) throw new Error("body_unexpected_fields");
  }
}

function bearerFrom(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function requireAuth(req, res, masterKey) {
  const presented = bearerFrom(req);
  if (!presented) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  pruneSessions();
  const sess = sessions.get(presented);
  if (sess && sess.expiresAt > Date.now()) {
    return true;
  }
  // Master key NÃO autentica APIs de dados — só shutdown (verificado no handler)
  if (timingSafeEqualStr(presented, masterKey)) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  sendJson(res, 401, { error: "unauthorized" });
  return false;
}

function requireMasterOrSession(req, res, masterKey) {
  const presented = bearerFrom(req);
  if (!presented) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  pruneSessions();
  if (timingSafeEqualStr(presented, masterKey)) return true;
  const sess = sessions.get(presented);
  if (sess && sess.expiresAt > Date.now()) return true;
  sendJson(res, 401, { error: "unauthorized" });
  return false;
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
  const { server } = createServer();
  server.listen(port, HOST, () => {
    runtimeLog("runtime_started", {
      host: HOST,
      port,
      version: RUNTIME_VERSION,
    });
    console.info(
      `[GF-AI] Runtime em http://${HOST}:${port} (sessões efêmeras; master key local)`,
    );
  });
  return server;
}
