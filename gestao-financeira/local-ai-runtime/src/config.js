/**
 * Configuração do Local AI Runtime.
 * Bind somente em 127.0.0.1 — nunca 0.0.0.0 por padrão.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const RUNTIME_VERSION = "1.1.0";
export const DEFAULT_PORT = Number(process.env.GF_AI_PORT || 43128);
export const HOST = process.env.GF_AI_HOST || "127.0.0.1";
export const OLLAMA_BASE =
  process.env.GF_OLLAMA_URL || "http://127.0.0.1:11434";
export const DEFAULT_MODEL =
  process.env.GF_AI_MODEL || "qwen2.5:1.5b";
export const FALLBACK_MODEL =
  process.env.GF_AI_FALLBACK_MODEL || "llama3.2:1b";
export const INFERENCE_TIMEOUT_MS = Number(
  process.env.GF_AI_TIMEOUT_MS || 90_000,
);
export const MAX_TOKENS = Number(process.env.GF_AI_MAX_TOKENS || 768);
export const SESSION_TTL_MS = Number(
  process.env.GF_AI_SESSION_TTL_MS || 60 * 60 * 1000,
);

export const ALLOWED_ORIGINS = new Set(
  (
    process.env.GF_AI_ORIGINS ||
    "http://127.0.0.1:43127,http://localhost:43127"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const DATA_DIR =
  process.env.GF_AI_DATA_DIR ||
  path.join(os.homedir(), ".gestao-financeira-ai");

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function tokenPath() {
  return path.join(ensureDataDir(), "runtime-master.key");
}

/** Restringe ACL no Windows ao usuário atual (mode 0o600 não basta). */
function hardenFileAcl(filePath) {
  if (process.platform !== "win32") return;
  try {
    const user = os.userInfo().username;
    spawnSync(
      "icacls",
      [filePath, "/inheritance:r", `/grant:r`, `${user}:F`],
      { windowsHide: true, stdio: "ignore" },
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Master key em disco — NUNCA enviada ao frontend.
 * Usada só para emitir sessões efêmeras.
 */
export function loadOrCreateMasterKey() {
  const p = tokenPath();
  if (fs.existsSync(p)) {
    const t = fs.readFileSync(p, "utf8").trim();
    if (t.length >= 32) return t;
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(p, token, { encoding: "utf8", mode: 0o600 });
  hardenFileAcl(p);
  return token;
}

/** @deprecated use loadOrCreateMasterKey */
export function loadOrCreateToken() {
  return loadOrCreateMasterKey();
}

export function runtimeLog(event, meta = {}) {
  // Nunca logar tokens, contexto financeiro, prompts ou respostas
  const safe = { ...meta };
  for (const k of Object.keys(safe)) {
    if (/token|bearer|authorization|pin|password|cipher/i.test(k)) {
      delete safe[k];
    }
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...safe,
  });
  console.info(line);
}

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}
