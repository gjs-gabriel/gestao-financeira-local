export type ProfileKind = "demo" | "personal" | "admin";
export type ProfileAvatar = "demo" | "user" | "briefcase" | "star" | "shield";

export interface UserProfile {
  id: string;
  name: string;
  displayName?: string;
  avatar?: ProfileAvatar;
  vaultId: string;
  kind: ProfileKind;
  createdAt: string;
  updatedAt: string;
}

export function createLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfileId(): string {
  return createLocalId("prof");
}

export function createVaultId(): string {
  return createLocalId("vault");
}

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

const LOGIN_RE = /^[a-z][a-z0-9._-]*$/;

export function validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.replace(/\s+/g, " ").trim();
  if (value.length < 2) return { ok: false, error: "Nome muito curto." };
  if (value.length > 60) return { ok: false, error: "Nome muito longo." };
  return { ok: true, value };
}

export function validateLogin(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: false, error: "Informe o login." };
  if (/\s/.test(raw.trim())) return { ok: false, error: "Login sem espaços." };
  if (value.length < 3) return { ok: false, error: "Login muito curto." };
  if (!LOGIN_RE.test(value)) {
    return { ok: false, error: "Login inválido (a-z, 0-9, . _ -)." };
  }
  return { ok: true, value };
}

export function buildUserProfile(input: {
  name: string;
  login?: string;
  kind?: ProfileKind;
  avatar?: ProfileAvatar;
  vaultId?: string;
}): UserProfile {
  const now = new Date().toISOString();
  const nameCheck = validateDisplayName(input.name);
  if (!nameCheck.ok) throw new Error(nameCheck.error);
  let login: string | undefined;
  if (input.login?.trim()) {
    const loginCheck = validateLogin(input.login);
    if (!loginCheck.ok) throw new Error(loginCheck.error);
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
      (input.kind === "demo" ? "demo" : input.kind === "admin" ? "shield" : "user"),
    vaultId: input.vaultId ?? createVaultId(),
    kind: input.kind ?? "personal",
    createdAt: now,
    updatedAt: now,
  };
}
