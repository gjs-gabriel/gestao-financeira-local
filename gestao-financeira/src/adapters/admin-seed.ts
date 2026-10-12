/**
 * Seed do usuário administrador local.
 * O cofre do admin é vazio e isolado — nunca recebe dados de outros perfis.
 */

import { createEmptySnapshot } from "@/domain";
import {
  ADMIN_DISPLAY_NAME,
  ADMIN_PROFILE_ID,
  ADMIN_USERNAME,
  ADMIN_VAULT_ID,
} from "@/domain/admin-profile";
import { assertNewVaultPin } from "@/security/limits";
import { encryptSnapshot } from "./crypto";
import type { UserProfile } from "./profiles";
import {
  getProfile,
  loadVaultEnvelope,
  putProfile,
  saveVaultEnvelope,
} from "./storage";

export function buildAdminProfile(now = new Date().toISOString()): UserProfile {
  return {
    id: ADMIN_PROFILE_ID,
    name: ADMIN_DISPLAY_NAME,
    displayName: ADMIN_USERNAME,
    avatar: "shield",
    vaultId: ADMIN_VAULT_ID,
    kind: "admin",
    createdAt: now,
    updatedAt: now,
  };
}

export type AdminSeedResult = {
  created: boolean;
  profile: UserProfile;
};

/**
 * Cria o perfil admin se ainda não existir.
 * Exige PIN escolhido pelo operador — não há PIN fixo de produção.
 */
export async function createAdminProfile(
  pin: string,
): Promise<AdminSeedResult> {
  assertNewVaultPin(pin);
  const existing = await getProfile(ADMIN_PROFILE_ID);
  if (existing) {
    return { created: false, profile: existing };
  }
  const profile = buildAdminProfile();
  // Snapshot vazio de propósito: admin não armazena finanças de terceiros.
  const envelope = await encryptSnapshot(createEmptySnapshot(), pin);
  await saveVaultEnvelope(profile.vaultId, envelope);
  await putProfile(profile);
  return { created: true, profile };
}

export async function ensureAdminProfile(
  pin: string,
): Promise<AdminSeedResult> {
  return createAdminProfile(pin);
}

export async function adminVaultExists(): Promise<boolean> {
  const p = await getProfile(ADMIN_PROFILE_ID);
  if (!p) return false;
  const env = await loadVaultEnvelope(p.vaultId);
  return !!env;
}

export {
  ADMIN_PROFILE_ID,
  ADMIN_VAULT_ID,
  ADMIN_DISPLAY_NAME,
  ADMIN_USERNAME,
} from "@/domain/admin-profile";
