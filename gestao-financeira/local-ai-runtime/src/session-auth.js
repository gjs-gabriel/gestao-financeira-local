/**
 * Sessões efêmeras do Local AI Runtime.
 * O master token NUNCA é enviado ao browser.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { AI_SESSION_TTL_MS } from "./limits-runtime.js";
import { ensureDataDir, tokenPath, runtimeLog } from "./config.js";

export function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function hardenTokenFileAcl(filePath) {
  if (process.platform !== "win32") return;
  try {
    const user = process.env.USERNAME || process.env.USER || "";
    if (!user) return;
    spawnSync(
      "icacls",
      [filePath, "/inheritance:r", "/grant:r", `${user}:F`],
      { windowsHide: true, stdio: "ignore" },
    );
  } catch {
    /* best-effort */
  }
}

function loadMasterToken() {
  ensureDataDir();
  const p = tokenPath();
  if (fs.existsSync(p)) {
    const t = fs.readFileSync(p, "utf8").trim();
    if (t.length >= 32) {
      hardenTokenFileAcl(p);
      return t;
    }
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(p, token, { encoding: "utf8", mode: 0o600 });
  hardenTokenFileAcl(p);
  return token;
}

/** @type {Map<string, { exp: number }>} */
const sessions = new Map();
let masterToken = null;

export function getMasterToken() {
  if (!masterToken) masterToken = loadMasterToken();
  return masterToken;
}

export function createSessionToken() {
  pruneSessions();
  const sessionToken = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionToken, { exp: Date.now() + AI_SESSION_TTL_MS });
  runtimeLog("session_created", { ttlMs: AI_SESSION_TTL_MS });
  return { token: sessionToken, expiresInMs: AI_SESSION_TTL_MS };
}

export function revokeSessionToken(token) {
  if (token) sessions.delete(token);
}

export function revokeAllSessions() {
  sessions.clear();
}

export function isValidSessionToken(token) {
  if (!token || typeof token !== "string") return false;
  pruneSessions();
  const s = sessions.get(token);
  if (!s) return false;
  if (s.exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function pruneSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.exp < now) sessions.delete(k);
  }
}

export function authorizeBearer(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return false;
  const m = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  if (!m) return false;
  const presented = m[1];
  if (timingSafeEqualString(presented, getMasterToken())) {
    runtimeLog("auth_rejected_master_in_bearer", {});
    return false;
  }
  return isValidSessionToken(presented);
}
