/**
 * Adapter criptográfico mobile — interoperável com o .gfin da web.
 *
 * Preferência: react-native-quick-crypto (PBKDF2 + AES-256-GCM via JSI/Nitro),
 * para não travar a UI com 310k iterações em JS puro.
 * Fallback: @noble (Expo Go / módulo nativo ausente) + yield à UI antes do KDF.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 as noblePbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import * as ExpoCrypto from "expo-crypto";
import { InteractionManager } from "react-native";
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

type QuickCryptoModule = {
  pbkdf2: (
    password: string | Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
    callback: (err: Error | null, derivedKey?: Uint8Array) => void,
  ) => void;
  createCipheriv: (
    algorithm: string,
    key: Uint8Array,
    iv: Uint8Array,
  ) => {
    update: (data: Uint8Array) => Uint8Array;
    final: () => Uint8Array;
    getAuthTag: () => Uint8Array;
  };
  createDecipheriv: (
    algorithm: string,
    key: Uint8Array,
    iv: Uint8Array,
  ) => {
    setAuthTag: (tag: Uint8Array) => void;
    update: (data: Uint8Array) => Uint8Array;
    final: () => Uint8Array;
  };
  install?: () => void;
};

let quick: QuickCryptoModule | null | undefined;
let installAttempted = false;

function getQuickCrypto(): QuickCryptoModule | null {
  if (quick !== undefined) return quick;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-quick-crypto") as QuickCryptoModule & {
      default?: QuickCryptoModule;
    };
    const api: QuickCryptoModule | undefined =
      typeof mod?.pbkdf2 === "function"
        ? mod
        : typeof mod?.default?.pbkdf2 === "function"
          ? mod.default
          : undefined;
    if (
      !api ||
      typeof api.pbkdf2 !== "function" ||
      typeof api.createCipheriv !== "function" ||
      typeof api.createDecipheriv !== "function"
    ) {
      quick = null;
      return null;
    }
    if (!installAttempted && typeof api.install === "function") {
      installAttempted = true;
      try {
        api.install();
      } catch {
        /* ignore */
      }
    }
    quick = api;
    return quick;
  } catch {
    quick = null;
    return null;
  }
}

/** true = KDF/AES nativos (dev build). false = fallback JS (Expo Go). */
export function isNativeCryptoAvailable(): boolean {
  return getQuickCrypto() != null;
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

function copyBytes(u8: Uint8Array): Uint8Array {
  const out = new Uint8Array(u8.byteLength);
  out.set(u8);
  return out;
}

async function randomBytes(length: number): Promise<Uint8Array> {
  const hex = await ExpoCrypto.getRandomBytesAsync(length);
  return new Uint8Array(hex);
}

export function canonicalizePin(pin: string): string {
  return pin.normalize("NFKC").trim();
}

async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 32));
}

/**
 * Deriva chave AES-256 (32 bytes) com PBKDF2-SHA256.
 * Nativo: Promise do Nitro (fora da JS thread).
 * Fallback: noble síncrono após yield à UI.
 */
export async function deriveKeyBytes(
  pin: string,
  salt: Uint8Array,
  iterations: number,
  onProgress?: CryptoProgressHandler,
): Promise<Uint8Array> {
  onProgress?.("deriving_key");
  const qc = getQuickCrypto();
  if (qc) {
    const saltCopy = copyBytes(salt);
    return new Promise((resolve, reject) => {
      qc.pbkdf2(pin, saltCopy, iterations, 32, "sha256", (err, key) => {
        if (err || !key) {
          reject(err ?? new Error("Falha no PBKDF2 nativo."));
          return;
        }
        resolve(copyBytes(key instanceof Uint8Array ? key : new Uint8Array(key)));
      });
    });
  }

  await yieldToUi();
  return noblePbkdf2(sha256, utf8ToBytes(pin), salt, {
    c: iterations,
    dkLen: 32,
  });
}

function aesGcmEncryptNative(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  const qc = getQuickCrypto()!;
  const cipher = qc.createCipheriv("aes-256-gcm", key, iv);
  const enc = cipher.update(plaintext);
  const fin = cipher.final();
  const tag = cipher.getAuthTag();
  // WebCrypto / noble: ciphertext || tag (16 bytes)
  const out = new Uint8Array(enc.length + fin.length + tag.length);
  out.set(enc, 0);
  out.set(fin, enc.length);
  out.set(tag, enc.length + fin.length);
  return out;
}

function aesGcmDecryptNative(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertextWithTag: Uint8Array,
): Uint8Array {
  const qc = getQuickCrypto()!;
  if (ciphertextWithTag.length < 17) {
    throw new Error("Ciphertext inválido");
  }
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const data = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const decipher = qc.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const p1 = decipher.update(data);
  const p2 = decipher.final();
  const out = new Uint8Array(p1.length + p2.length);
  out.set(p1, 0);
  out.set(p2, p1.length);
  return out;
}

function aesGcmEncryptNoble(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  return gcm(key, iv).encrypt(plaintext);
}

function aesGcmDecryptNoble(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertextWithTag: Uint8Array,
): Uint8Array {
  return gcm(key, iv).decrypt(ciphertextWithTag);
}

/** Cifra o snapshot com PIN → envelope .gfin (compatível com a web). */
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
  const qc = getQuickCrypto();
  const ciphertext = qc
    ? aesGcmEncryptNative(key, iv, plaintext)
    : aesGcmEncryptNoble(key, iv, plaintext);

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

/** Decifra envelope .gfin com PIN → snapshot. */
export async function decryptEnvelope(
  envelope: GfinEnvelope,
  pin: string,
  onProgress?: CryptoProgressHandler,
): Promise<VaultSnapshot> {
  onProgress?.("preparing");
  assertSafeGfinEnvelope(envelope);
  const keyPin = canonicalizePin(pin);
  if (!keyPin) throw new Error("Informe o PIN.");

  const salt = copyBytes(b64Decode(envelope.kdf.salt));
  const iv = copyBytes(b64Decode(envelope.cipher.iv));
  const ct = copyBytes(b64Decode(envelope.ciphertext));
  const key = await deriveKeyBytes(
    keyPin,
    salt,
    envelope.kdf.iterations,
    onProgress,
  );

  onProgress?.("cipher");
  let text: string;
  try {
    const qc = getQuickCrypto();
    const plain = qc
      ? aesGcmDecryptNative(key, iv, ct)
      : aesGcmDecryptNoble(key, iv, ct);
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
