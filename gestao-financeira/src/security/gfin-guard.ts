/**
 * Validação de parâmetros KDF/envelope antes de operações custosas.
 */

import type { GfinEnvelope } from "@/domain";
import {
  KDF_ITERATIONS_MAX,
  KDF_ITERATIONS_MIN,
  KDF_IV_BYTES,
  KDF_MAX_CIPHERTEXT_BYTES,
  KDF_SALT_BYTES,
} from "./limits";

function b64ByteLength(b64: string): number {
  if (typeof b64 !== "string" || b64.length === 0) return -1;
  // aproximação segura: rejeitar strings enormes antes do atob
  if (b64.length > KDF_MAX_CIPHERTEXT_BYTES * 2) return -1;
  try {
    const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    return Math.floor((b64.length * 3) / 4) - pad;
  } catch {
    return -1;
  }
}

/**
 * Valida envelope .gfin ANTES do PBKDF2.
 * Rejeita iterações absurdas / salt/IV inválidos / ciphertext gigante.
 */
export function assertSafeGfinEnvelope(envelope: GfinEnvelope): void {
  if (envelope.format !== "gfin") {
    throw new Error("Arquivo não é um cofre .gfin válido");
  }
  if (envelope.version !== 1) {
    throw new Error(
      `Versão do cofre não suportada: ${String(envelope.version)}`,
    );
  }
  if (envelope.kdf?.algorithm !== "PBKDF2") {
    throw new Error("Algoritmo KDF não suportado");
  }
  if (envelope.kdf?.hash !== "SHA-256") {
    throw new Error("Hash KDF não suportado");
  }
  if (envelope.cipher?.algorithm !== "AES-GCM") {
    throw new Error("Algoritmo de cifra não suportado");
  }

  const iterations = Number(envelope.kdf.iterations);
  if (
    !Number.isInteger(iterations) ||
    iterations < KDF_ITERATIONS_MIN ||
    iterations > KDF_ITERATIONS_MAX
  ) {
    throw new Error(
      `Parâmetros KDF inválidos (iterações devem estar entre ${KDF_ITERATIONS_MIN} e ${KDF_ITERATIONS_MAX}).`,
    );
  }

  const saltLen = b64ByteLength(envelope.kdf.salt);
  if (saltLen !== KDF_SALT_BYTES) {
    throw new Error("Salt do cofre inválido");
  }
  const ivLen = b64ByteLength(envelope.cipher.iv);
  if (ivLen !== KDF_IV_BYTES) {
    throw new Error("IV do cofre inválido");
  }
  const ctLen = b64ByteLength(envelope.ciphertext);
  if (ctLen < 16 || ctLen > KDF_MAX_CIPHERTEXT_BYTES) {
    throw new Error("Conteúdo cifrado do cofre inválido ou excessivo");
  }
}

export function sanitizeImportString(
  value: unknown,
  maxChars: number,
): string {
  const s = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
  return s.slice(0, maxChars);
}

/**
 * Strings bancárias (Open Finance / Pluggy) — remove controles e caracteres
 * típicos de markup para defesa em profundidade além do escaping do React.
 */
export function sanitizeBankString(
  value: unknown,
  maxChars = 500,
): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>&"'`]/g, "")
    .trim()
    .slice(0, maxChars);
}
