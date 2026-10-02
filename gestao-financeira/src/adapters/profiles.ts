/**
 * Perfis locais (metadados públicos) — sem dados financeiros nem PIN.
 */

export type ProfileKind = "demo" | "personal" | "admin";

export type ProfileAvatar = "demo" | "user" | "briefcase" | "star" | "shield";

export interface UserProfile {
  id: string;
  /** Nome de apresentação (pode ter espaços). */
  name: string;
  /**
   * Login único no dispositivo (sem espaços).
   * Ex.: marina.demo, joao.silva
   */
  displayName?: string;
  avatar?: ProfileAvatar;
  vaultId: string;
  kind: ProfileKind;
  createdAt: string;
  updatedAt: string;
}

export function createProfileId(): string {
  return createLocalId("prof");
}

export function createVaultId(): string {
  return createLocalId("vault");
}

export function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Nome de arquivo .gfin a partir do nome do perfil. */
export function slugifyProfileName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "cofre";
}

import {
  validateDisplayName,
  validateLogin,
} from "./profile-fields";

export function buildUserProfile(input: {
  name: string;
  kind?: ProfileKind;
  avatar?: ProfileAvatar;
  /** Login (obrigatório para personal/admin novos). */
  displayName?: string;
  login?: string;
  vaultId?: string;
  now?: string;
}): UserProfile {
  const now = input.now ?? new Date().toISOString();
  const nameCheck = validateDisplayName(input.name);
  if (!nameCheck.ok) {
    throw new Error(nameCheck.error);
  }
  const loginRaw = input.login ?? input.displayName ?? "";
  let login: string | undefined;
  if (loginRaw.trim()) {
    const loginCheck = validateLogin(loginRaw);
    if (!loginCheck.ok) {
      throw new Error(loginCheck.error);
    }
    login = loginCheck.value;
  } else if (input.kind !== "demo") {
    throw new Error("Informe o login do usuário.");
  }
  return {
    id: createProfileId(),
    name: nameCheck.value,
    displayName: login,
    avatar:
      input.avatar ??
      (input.kind === "demo"
        ? "demo"
        : input.kind === "admin"
          ? "shield"
          : "user"),
    vaultId: input.vaultId ?? createVaultId(),
    kind: input.kind ?? "personal",
    createdAt: now,
    updatedAt: now,
  };
}

/** Associa envelope legado a um novo profile (ciphertext intacto até re-save). */
export function planLegacyMigration(opts: {
  name: string;
  login?: string;
  now?: string;
}): { profile: UserProfile; vaultId: string } {
  const derived =
    opts.name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 32) || "usuario";
  const login = opts.login ?? derived;
  const safeLogin = /^[a-z]/.test(login) ? login : `u.${login}`;
  const profile = buildUserProfile({
    name: opts.name,
    login: safeLogin,
    kind: "personal",
    avatar: "user",
    now: opts.now,
  });
  return { profile, vaultId: profile.vaultId };
}
