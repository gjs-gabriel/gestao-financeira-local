import {
  GFIN_FORMAT_VERSION,
  PBKDF2_ITERATIONS,
  parseSnapshot,
  type GfinEnvelope,
  type VaultSnapshot,
} from "@/domain";

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
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Cifra o snapshot com PIN → envelope .gfin versionado. */
export async function encryptSnapshot(
  snapshot: VaultSnapshot,
  pin: string,
): Promise<GfinEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
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
  if (envelope.format !== "gfin") {
    throw new Error("Arquivo não é um cofre .gfin válido");
  }
  if (envelope.version !== 1) {
    throw new Error(
      `Versão do cofre não suportada: ${String(envelope.version)}`,
    );
  }
  const salt = b64Decode(envelope.kdf.salt);
  const iv = b64Decode(envelope.cipher.iv);
  const key = await deriveKey(pin, salt, envelope.kdf.iterations);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      b64Decode(envelope.ciphertext) as BufferSource,
    );
    const text = new TextDecoder().decode(plainBuf);
    return parseSnapshot(JSON.parse(text));
  } catch {
    throw new Error("PIN incorreto ou cofre corrompido");
  }
}

export function parseEnvelope(raw: unknown): GfinEnvelope {
  if (!raw || typeof raw !== "object") {
    throw new Error("Envelope inválido");
  }
  const e = raw as Partial<GfinEnvelope>;
  if (e.format !== "gfin" || e.version !== 1) {
    throw new Error("Formato .gfin inválido ou versão não suportada");
  }
  if (!e.kdf?.salt || !e.cipher?.iv || !e.ciphertext) {
    throw new Error("Envelope .gfin incompleto");
  }
  return e as GfinEnvelope;
}
