import {
  GFIN_FORMAT_VERSION,
  PBKDF2_ITERATIONS,
  parseSnapshot,
  type GfinEnvelope,
  type VaultSnapshot,
} from "@/domain";
import { assertSafeGfinEnvelope } from "@/security/gfin-guard";
import { validateGfinEnvelope } from "@/security/gfin-validate";

function b64Encode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!);
  return btoa(binary);
}

function b64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cópia própria — evita falhas do WebCrypto com views compartilhadas. */
function copyBytes(u8: Uint8Array): Uint8Array {
  const out = new Uint8Array(u8.byteLength);
  out.set(u8);
  return out;
}

/**
 * Canonicaliza o PIN de forma determinística (única).
 * Mesma função em cifrar e decifrar — sem variantes, sem tentativas extras.
 */
export function canonicalizePin(pin: string): string {
  return pin.normalize("NFKC").trim();
}

async function deriveKey(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: copyBytes(salt),
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
}

/** Cifra o snapshot com PIN → envelope .gfin versionado (AES-256-GCM). */
export async function encryptSnapshot(
  snapshot: VaultSnapshot,
  pin: string,
): Promise<GfinEnvelope> {
  const keyPin = canonicalizePin(pin);
  if (!keyPin) {
    throw new Error("PIN vazio — não é possível cifrar o cofre.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(keyPin, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: copyBytes(iv) },
    key,
    plaintext,
  );
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
): Promise<VaultSnapshot> {
  // Validar ANTES do KDF (protege contra .gfin fabricado com iterações absurdas)
  assertSafeGfinEnvelope(envelope);

  const keyPin = canonicalizePin(pin);
  if (!keyPin) {
    throw new Error("Informe o PIN.");
  }

  const salt = copyBytes(b64Decode(envelope.kdf.salt));
  const iv = copyBytes(b64Decode(envelope.cipher.iv));
  const ct = copyBytes(b64Decode(envelope.ciphertext));
  const key = await deriveKey(keyPin, salt, envelope.kdf.iterations);

  let text: string;
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct,
    );
    text = new TextDecoder().decode(plainBuf);
  } catch {
    // Uma única tentativa com o PIN canônico — sem variantes nem chaves de fallback.
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
    return parseSnapshot(raw);
  } catch (e) {
    // PIN estava certo — não mascarar erro de schema/migração como PIN inválido.
    const detail = e instanceof Error ? e.message : "Snapshot inválido";
    throw new Error(
      `PIN correto, mas o cofre não pôde ser lido (${detail}). Tente recarregar o app.`,
    );
  }
}

export function parseEnvelope(raw: unknown): GfinEnvelope {
  const checked = validateGfinEnvelope(raw);
  if (!checked.ok) {
    throw new Error(checked.error);
  }
  return checked.envelope;
}
