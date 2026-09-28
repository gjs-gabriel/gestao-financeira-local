import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { GfinEnvelope } from "@/domain";
import { parseEnvelope } from "./crypto";
import type { UserProfile } from "./profiles";

interface GfinDb extends DBSchema {
  /** Cofre único legado (v1) — chave "current". */
  vault: {
    key: string;
    value: GfinEnvelope;
  };
  meta: {
    key: string;
    value: string;
  };
  profiles: {
    key: string;
    value: UserProfile;
  };
  vaults: {
    key: string;
    value: GfinEnvelope;
  };
}

const DB_NAME = "gestao-financeira";
const DB_VERSION = 2;
const LEGACY_ENVELOPE_KEY = "current";

let dbPromise: Promise<IDBPDatabase<GfinDb>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB indisponível");
  }
  if (!dbPromise) {
    dbPromise = openDB<GfinDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("vault")) {
            db.createObjectStore("vault");
          }
          if (!db.objectStoreNames.contains("meta")) {
            db.createObjectStore("meta");
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("profiles")) {
            db.createObjectStore("profiles", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("vaults")) {
            db.createObjectStore("vaults");
          }
        }
      },
    });
  }
  return dbPromise;
}

/** @deprecated Prefer saveVaultEnvelope — mantido para testes/migração. */
export async function saveEnvelope(envelope: GfinEnvelope): Promise<void> {
  const db = await getDb();
  await db.put("vault", envelope, LEGACY_ENVELOPE_KEY);
}

/** @deprecated Prefer loadVaultEnvelope */
export async function loadEnvelope(): Promise<GfinEnvelope | null> {
  return loadLegacyEnvelope();
}

export async function loadLegacyEnvelope(): Promise<GfinEnvelope | null> {
  const db = await getDb();
  const raw = await db.get("vault", LEGACY_ENVELOPE_KEY);
  if (!raw) return null;
  return parseEnvelope(raw);
}

export async function clearLegacyEnvelope(): Promise<void> {
  const db = await getDb();
  await db.delete("vault", LEGACY_ENVELOPE_KEY);
}

export async function hasLegacyVault(): Promise<boolean> {
  return (await loadLegacyEnvelope()) !== null;
}

export async function clearVaultStorage(): Promise<void> {
  const db = await getDb();
  await db.delete("vault", LEGACY_ENVELOPE_KEY);
}

export async function hasVault(): Promise<boolean> {
  const n = await countProfiles();
  if (n > 0) return true;
  return hasLegacyVault();
}

export async function listProfiles(): Promise<UserProfile[]> {
  const db = await getDb();
  const all = await db.getAll("profiles");
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countProfiles(): Promise<number> {
  const db = await getDb();
  return db.count("profiles");
}

export async function getProfile(id: string): Promise<UserProfile | null> {
  const db = await getDb();
  return (await db.get("profiles", id)) ?? null;
}

export async function putProfile(profile: UserProfile): Promise<void> {
  const db = await getDb();
  await db.put("profiles", profile);
}

export async function deleteProfileRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("profiles", id);
}

export async function saveVaultEnvelope(
  vaultId: string,
  envelope: GfinEnvelope,
): Promise<void> {
  const db = await getDb();
  await db.put("vaults", envelope, vaultId);
}

export async function loadVaultEnvelope(
  vaultId: string,
): Promise<GfinEnvelope | null> {
  const db = await getDb();
  const raw = await db.get("vaults", vaultId);
  if (!raw) return null;
  return parseEnvelope(raw);
}

export async function deleteVaultEnvelope(vaultId: string): Promise<void> {
  const db = await getDb();
  await db.delete("vaults", vaultId);
}

/** Remove profile + vault associado. */
export async function deleteProfileAndVault(
  profileId: string,
  vaultId: string,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["profiles", "vaults"], "readwrite");
  await tx.objectStore("profiles").delete(profileId);
  await tx.objectStore("vaults").delete(vaultId);
  await tx.done;
}

/**
 * Migração one-shot: move envelope legado para vaults[vaultId],
 * grava profile e limpa vault/current.
 */
export async function commitLegacyMigration(
  profile: UserProfile,
  legacyEnvelope: GfinEnvelope,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["profiles", "vaults", "vault"], "readwrite");
  await tx.objectStore("vaults").put(legacyEnvelope, profile.vaultId);
  await tx.objectStore("profiles").put(profile);
  await tx.objectStore("vault").delete(LEGACY_ENVELOPE_KEY);
  await tx.done;
}
