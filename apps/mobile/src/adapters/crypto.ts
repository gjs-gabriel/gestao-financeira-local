/**
 * Fallback tipado (TypeScript / web). No device, Metro usa `crypto.native.ts`.
 * Mantém a mesma assinatura e o contrato .gfin da web.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import * as ExpoCrypto from "expo-crypto";
import {
  GFIN_FORMAT_VERSION,
  PBKDF2_ITERATIONS,
  assertSafeGfinEnvelope,
  parseSnapshot,
  validateGfinEnvelope,
  type GfinEnvelope,
  type VaultSnapshot,
} from "@gf/core";

export type CryptoProgress =
  | "idle"
  | "preparing"
  | "deriving_key"
  | "cipher"
  | "done";

export type CryptoProgressHandler = (stage: CryptoProgress) => void;

export function isNativeCryptoAvailable(): boolean {
  return false;
}

function b64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  if (typeof btoa === "function") return btoa(binary);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += chars[(triple >> 18) & 63];
    out += chars[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? chars[triple & 63] : "=";
  }
  return out;
}

function b64Decode(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const cleaned = b64.replace(/=+$/, "");
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    const n =
      (chars.indexOf(cleaned[i]!) << 18) |
      (chars.indexOf(cleaned[i + 1]!) << 12) |
      ((chars.indexOf(cleaned[i + 2]!) || 0) << 6) |
      (chars.indexOf(cleaned[i + 3]!) || 0);
    out.push((n >> 16) & 255);
    if (cleaned[i + 2] && cleaned[i + 2] !== "=") out.push((n >> 8) & 255);
    if (cleaned[i + 3] && cleaned[i + 3] !== "=") out.push(n & 255);
  }
  return new Uint8Array(out);
}

async function randomBytes(length: number): Promise<Uint8Array> {
  const hex = await ExpoCrypto.getRandomBytesAsync(length);
  return new Uint8Array(hex);
}

export function canonicalizePin(pin: string): string {
  return pin.normalize("NFKC").trim();
}

export async function deriveKeyBytes(
  pin: string,
  salt: Uint8Array,
  iterations: number,
  onProgress?: CryptoProgressHandler,
): Promise<Uint8Array> {
  onProgress?.("deriving_key");
  return pbkdf2(sha256, utf8ToBytes(pin), salt, {
    c: iterations,
    dkLen: 32,
  });
}

export async function encryptSnapshot(
  snapshot: VaultSnapshot,
  pin: string,
  onProgress?: CryptoProgressHandler,
): Promise<GfinEnvelope> {
  onProgress?.("preparing");
  const keyPin = canonicalizePin(pin);
  if (!keyPin) throw new Error("PIN vazio — não é possível cifrar o cofre.");
  const salt = await randomBytes(16);
  const iv = await randomBytes(12);
  const key = await deriveKeyBytes(keyPin, salt, PBKDF2_ITERATIONS, onProgress);
  onProgress?.("cipher");
  const plaintext = utf8ToBytes(JSON.stringify(snapshot));
  const ciphertext = gcm(key, iv).encrypt(plaintext);
  onProgress?.("done");
  return {
    format: "gfin",
    version: GFIN_FORMAT_VERSION,
    kdf: {
      algorithm: "PBKDF2",
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
      salt: b64Encode(salt),
    },
    cipher: {
      algorithm: "AES-GCM",
      iv: b64Encode(iv),
    },
    ciphertext: b64Encode(ciphertext),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptEnvelope(
  envelope: GfinEnvelope,
  pin: string,
  onProgress?: CryptoProgressHandler,
): Promise<VaultSnapshot> {
  onProgress?.("preparing");
  assertSafeGfinEnvelope(envelope);
  const keyPin = canonicalizePin(pin);
  if (!keyPin) throw new Error("Informe o PIN.");

  const salt = b64Decode(envelope.kdf.salt);
  const iv = b64Decode(envelope.cipher.iv);
  const ct = b64Decode(envelope.ciphertext);
  const key = await deriveKeyBytes(
    keyPin,
    salt,
    envelope.kdf.iterations,
    onProgress,
  );

  onProgress?.("cipher");
  let text: string;
  try {
    const plain = gcm(key, iv).decrypt(ct);
    text = new TextDecoder().decode(plain);
  } catch {
    throw new Error("PIN incorreto ou cofre corrompido");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      "Cofre abriu, mas o conteúdo não é JSON válido (possível corrupção).",
    );
  }

  try {
    const snap = parseSnapshot(raw);
    onProgress?.("done");
    return snap;
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Snapshot inválido";
    throw new Error(
      `PIN correto, mas o cofre não pôde ser lido (${detail}).`,
    );
  }
}

export function parseEnvelope(raw: unknown): GfinEnvelope {
  const checked = validateGfinEnvelope(raw);
  if (!checked.ok) throw new Error(checked.error);
  return checked.envelope;
}
