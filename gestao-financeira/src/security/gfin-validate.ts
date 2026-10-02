/**
 * Validação do envelope .gfin ANTES do KDF custoso.
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
  if (typeof b64 !== "string" || !b64) return -1;
  // aproximação: padding
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export type EnvelopeValidation =
  | { ok: true; envelope: GfinEnvelope }
  | { ok: false; error: string };

/**
 * Valida formato/limites do envelope. Deve rodar antes de deriveKey.
 */
export function validateGfinEnvelope(raw: unknown): EnvelopeValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Envelope inválido" };
  }
  const e = raw as Partial<GfinEnvelope>;
  if (e.format !== "gfin") {
    return { ok: false, error: "Arquivo não é um cofre .gfin válido" };
  }
  if (e.version !== 1) {
    return {
      ok: false,
      error: `Versão do cofre não suportada: ${String(e.version)}`,
    };
  }
  if (!e.kdf || typeof e.kdf !== "object") {
    return { ok: false, error: "Envelope .gfin incompleto (kdf)" };
  }
  if (e.kdf.algorithm !== "PBKDF2" || e.kdf.hash !== "SHA-256") {
    return { ok: false, error: "Parâmetros de KDF não suportados" };
  }
  if (
    typeof e.kdf.iterations !== "number" ||
    !Number.isInteger(e.kdf.iterations)
  ) {
    return { ok: false, error: "Iterações de KDF inválidas" };
  }
  if (
    e.kdf.iterations < KDF_ITERATIONS_MIN ||
    e.kdf.iterations > KDF_ITERATIONS_MAX
  ) {
    return {
      ok: false,
      error: `Parâmetros de KDF fora dos limites seguros (${KDF_ITERATIONS_MIN}–${KDF_ITERATIONS_MAX}).`,
    };
  }
  if (typeof e.kdf.salt !== "string" || !e.kdf.salt) {
    return { ok: false, error: "Salt do cofre inválido" };
  }
  const saltLen = b64ByteLength(e.kdf.salt);
  if (saltLen !== KDF_SALT_BYTES) {
    return { ok: false, error: "Salt do cofre com tamanho inválido" };
  }
  if (!e.cipher || e.cipher.algorithm !== "AES-GCM") {
    return { ok: false, error: "Cifra do cofre não suportada" };
  }
  if (typeof e.cipher.iv !== "string" || !e.cipher.iv) {
    return { ok: false, error: "IV do cofre inválido" };
  }
  const ivLen = b64ByteLength(e.cipher.iv);
  if (ivLen !== KDF_IV_BYTES) {
    return { ok: false, error: "IV do cofre com tamanho inválido" };
  }
  if (typeof e.ciphertext !== "string" || !e.ciphertext) {
    return { ok: false, error: "Ciphertext ausente" };
  }
  const ctLen = b64ByteLength(e.ciphertext);
  if (ctLen < 16 || ctLen > KDF_MAX_CIPHERTEXT_BYTES) {
    return { ok: false, error: "Ciphertext com tamanho inválido" };
  }
  return { ok: true, envelope: e as GfinEnvelope };
}
