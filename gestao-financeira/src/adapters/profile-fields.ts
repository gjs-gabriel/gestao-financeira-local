/**
 * Validação de nome de apresentação e login de perfil.
 */

export const LOGIN_MIN = 3;
export const LOGIN_MAX = 32;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;

/** Login: minúsculas, sem espaços; letras, números, . _ - */
const LOGIN_RE = /^[a-z][a-z0-9._-]*$/;

export type FieldValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Normaliza login: trim, lower case, remove espaços acidentais nas pontas. */
export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateDisplayName(raw: string): FieldValidation {
  const value = raw.replace(/\s+/g, " ").trim();
  if (value.length < DISPLAY_NAME_MIN) {
    return {
      ok: false,
      error: `Nome de apresentação deve ter pelo menos ${DISPLAY_NAME_MIN} caracteres.`,
    };
  }
  if (value.length > DISPLAY_NAME_MAX) {
    return {
      ok: false,
      error: `Nome de apresentação deve ter no máximo ${DISPLAY_NAME_MAX} caracteres.`,
    };
  }
  return { ok: true, value };
}

export function validateLogin(raw: string): FieldValidation {
  const value = normalizeLogin(raw);
  if (!value) {
    return { ok: false, error: "Informe o login." };
  }
  if (/\s/.test(raw.trim())) {
    return {
      ok: false,
      error: "O login não pode conter espaços entre palavras.",
    };
  }
  if (value.length < LOGIN_MIN) {
    return {
      ok: false,
      error: `Login deve ter pelo menos ${LOGIN_MIN} caracteres.`,
    };
  }
  if (value.length > LOGIN_MAX) {
    return {
      ok: false,
      error: `Login deve ter no máximo ${LOGIN_MAX} caracteres.`,
    };
  }
  if (!LOGIN_RE.test(value)) {
    return {
      ok: false,
      error:
        "Login deve começar com letra e usar apenas a-z, 0-9, ponto, _ ou - (sem espaços).",
    };
  }
  return { ok: true, value };
}

export function assertUniqueLogin(
  login: string,
  profiles: { id: string; displayName?: string }[],
  excludeProfileId?: string,
): void {
  const normalized = normalizeLogin(login);
  const clash = profiles.find(
    (p) =>
      p.id !== excludeProfileId &&
      p.displayName &&
      normalizeLogin(p.displayName) === normalized,
  );
  if (clash) {
    throw new Error("Este login já está em uso neste dispositivo.");
  }
}

/** Login efetivo do perfil (campo displayName). */
export function profileLogin(profile: {
  displayName?: string;
}): string | undefined {
  return profile.displayName?.trim() || undefined;
}
