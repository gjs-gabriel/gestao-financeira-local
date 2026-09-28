/**
 * Persistência do perfil oficial Marina Costa no IndexedDB.
 * Idempotente: create/ensure não duplica; reset recria do zero.
 */

import {
  createMarinaDemoSnapshot,
  formatMarinaCredentialsBanner,
  MARINA_DEMO_CREDENTIALS,
  MARINA_DEMO_DISPLAY_NAME,
  MARINA_DEMO_PIN,
  MARINA_DEMO_PROFILE_ID,
  MARINA_DEMO_USERNAME,
  MARINA_DEMO_VAULT_ID,
  validateMarinaDemoSnapshot,
  type VaultSnapshot,
} from "@/domain";
import { encryptSnapshot, decryptEnvelope } from "./crypto";
import type { UserProfile } from "./profiles";
import {
  deleteProfileAndVault,
  getProfile,
  listProfiles,
  loadVaultEnvelope,
  putProfile,
  saveVaultEnvelope,
} from "./storage";

export type MarinaSeedResult = {
  created: boolean;
  reset: boolean;
  profile: UserProfile;
  credentials: typeof MARINA_DEMO_CREDENTIALS;
  banner: string;
  validation: ReturnType<typeof validateMarinaDemoSnapshot>;
};

function marinaProfile(now = new Date().toISOString()): UserProfile {
  return {
    id: MARINA_DEMO_PROFILE_ID,
    name: MARINA_DEMO_DISPLAY_NAME,
    displayName: MARINA_DEMO_USERNAME,
    avatar: "demo",
    vaultId: MARINA_DEMO_VAULT_ID,
    kind: "demo",
    createdAt: now,
    updatedAt: now,
  };
}

async function persistMarinaVault(
  snapshot: VaultSnapshot,
  pin: string = MARINA_DEMO_PIN,
): Promise<UserProfile> {
  const profile = marinaProfile(snapshot.updatedAt);
  const envelope = await encryptSnapshot(snapshot, pin);
  await saveVaultEnvelope(profile.vaultId, envelope);
  await putProfile(profile);
  return profile;
}

/** Cria o perfil Marina se ainda não existir. */
export async function createMarinaDemoProfile(
  pin: string = MARINA_DEMO_PIN,
): Promise<MarinaSeedResult> {
  const existing = await getProfile(MARINA_DEMO_PROFILE_ID);
  if (existing) {
    const env = await loadVaultEnvelope(existing.vaultId);
    let validation = validateMarinaDemoSnapshot(
      createMarinaDemoSnapshot(), // fallback shape
    );
    if (env) {
      try {
        const data = await decryptEnvelope(env, pin);
        validation = validateMarinaDemoSnapshot(data);
      } catch {
        /* PIN diferente — ainda assim perfil existe */
      }
    }
    return {
      created: false,
      reset: false,
      profile: existing,
      credentials: MARINA_DEMO_CREDENTIALS,
      banner: formatMarinaCredentialsBanner(),
      validation,
    };
  }

  // Também detecta por displayName/username em profiles antigos
  const all = await listProfiles();
  const byName = all.find(
    (p) =>
      p.displayName === MARINA_DEMO_USERNAME ||
      p.name === MARINA_DEMO_DISPLAY_NAME,
  );
  if (byName) {
    return {
      created: false,
      reset: false,
      profile: byName,
      credentials: MARINA_DEMO_CREDENTIALS,
      banner: formatMarinaCredentialsBanner(),
      validation: validateMarinaDemoSnapshot(createMarinaDemoSnapshot()),
    };
  }

  const snapshot = createMarinaDemoSnapshot();
  const validation = validateMarinaDemoSnapshot(snapshot);
  const profile = await persistMarinaVault(snapshot, pin);
  return {
    created: true,
    reset: false,
    profile,
    credentials: MARINA_DEMO_CREDENTIALS,
    banner: formatMarinaCredentialsBanner(),
    validation,
  };
}

/** Garante que o perfil exista (cria se necessário). */
export async function ensureMarinaDemoProfile(
  pin: string = MARINA_DEMO_PIN,
): Promise<MarinaSeedResult> {
  return createMarinaDemoProfile(pin);
}

/** Apaga e recria exclusivamente o perfil Marina. */
export async function resetMarinaDemoProfile(
  pin: string = MARINA_DEMO_PIN,
): Promise<MarinaSeedResult> {
  const existing = await getProfile(MARINA_DEMO_PROFILE_ID);
  if (existing) {
    await deleteProfileAndVault(existing.id, existing.vaultId);
  } else {
    const all = await listProfiles();
    const byName = all.find(
      (p) =>
        p.displayName === MARINA_DEMO_USERNAME ||
        (p.kind === "demo" && p.name === MARINA_DEMO_DISPLAY_NAME),
    );
    if (byName) {
      await deleteProfileAndVault(byName.id, byName.vaultId);
    }
  }

  const snapshot = createMarinaDemoSnapshot();
  const validation = validateMarinaDemoSnapshot(snapshot);
  const profile = await persistMarinaVault(snapshot, pin);
  return {
    created: true,
    reset: true,
    profile,
    credentials: MARINA_DEMO_CREDENTIALS,
    banner: formatMarinaCredentialsBanner(),
    validation,
  };
}

export {
  MARINA_DEMO_PIN,
  MARINA_DEMO_PROFILE_ID,
  MARINA_DEMO_VAULT_ID,
  MARINA_DEMO_USERNAME,
  MARINA_DEMO_DISPLAY_NAME,
  MARINA_DEMO_CREDENTIALS,
  formatMarinaCredentialsBanner,
};
