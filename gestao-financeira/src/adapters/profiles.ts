/**
 * Perfis locais (metadados públicos) — sem dados financeiros nem PIN.
 */

export type ProfileKind = "demo" | "personal";

export type ProfileAvatar = "demo" | "user" | "briefcase" | "star";

export interface UserProfile {
  id: string;
  /** Nome exibido na seleção. */
  name: string;
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

export function buildUserProfile(input: {
  name: string;
  kind?: ProfileKind;
  avatar?: ProfileAvatar;
  displayName?: string;
  vaultId?: string;
  now?: string;
}): UserProfile {
  const now = input.now ?? new Date().toISOString();
  return {
    id: createProfileId(),
    name: input.name.trim() || "Usuário",
    displayName: input.displayName?.trim() || undefined,
    avatar: input.avatar ?? (input.kind === "demo" ? "demo" : "user"),
    vaultId: input.vaultId ?? createVaultId(),
    kind: input.kind ?? "personal",
    createdAt: now,
    updatedAt: now,
  };
}

/** Associa envelope legado a um novo profile (ciphertext intacto até re-save). */
export function planLegacyMigration(opts: {
  name: string;
  now?: string;
}): { profile: UserProfile; vaultId: string } {
  const profile = buildUserProfile({
    name: opts.name,
    kind: "personal",
    avatar: "user",
    now: opts.now,
  });
  return { profile, vaultId: profile.vaultId };
}
