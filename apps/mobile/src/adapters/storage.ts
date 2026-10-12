/**
 * Tipagem / fallback. No device, Metro usa `storage.native.ts` (arquivo em disco).
 * Aqui o cofre também vai para documentDirectory — AsyncStorage só para perfis.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GfinEnvelope } from "@gf/core";
import * as FileSystem from "expo-file-system/legacy";
import { parseEnvelope } from "./crypto";
import type { UserProfile } from "./profiles";

const PROFILES_KEY = "gf.profiles";
const legacyVaultKey = (vaultId: string) => `gf.vault.${vaultId}`;

function vaultsDir(): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error("Armazenamento local indisponível neste aparelho.");
  return `${base}vaults/`;
}

function vaultPath(vaultId: string): string {
  const safe = vaultId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${vaultsDir()}${safe}.gfin`;
}

async function ensureVaultsDir(): Promise<void> {
  const dir = vaultsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function saveVault(
  vaultId: string,
  envelope: string,
): Promise<void> {
  await ensureVaultsDir();
  await FileSystem.writeAsStringAsync(vaultPath(vaultId), envelope, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await AsyncStorage.removeItem(legacyVaultKey(vaultId));
}

export async function loadVault(vaultId: string): Promise<string> {
  const path = vaultPath(vaultId);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists && !info.isDirectory) {
    return FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  const legacy = await AsyncStorage.getItem(legacyVaultKey(vaultId));
  if (legacy) {
    await saveVault(vaultId, legacy);
    return legacy;
  }
  throw new Error("Cofre não encontrado neste aparelho.");
}

export async function listProfiles(): Promise<UserProfile[]> {
  const raw = await AsyncStorage.getItem(PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UserProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function putProfile(profile: UserProfile): Promise<void> {
  const all = await listProfiles();
  const idx = all.findIndex((p) => p.id === profile.id);
  if (idx >= 0) all[idx] = profile;
  else all.push(profile);
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(all));
}

export async function getProfile(id: string): Promise<UserProfile | null> {
  const all = await listProfiles();
  return all.find((p) => p.id === id) ?? null;
}

export async function deleteProfileAndVault(profileId: string): Promise<void> {
  const all = await listProfiles();
  const profile = all.find((p) => p.id === profileId);
  const next = all.filter((p) => p.id !== profileId);
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  if (profile) {
    const path = vaultPath(profile.vaultId);
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
      }
    } catch {
      /* ignore */
    }
    await AsyncStorage.removeItem(legacyVaultKey(profile.vaultId));
  }
}

export async function saveVaultEnvelope(
  vaultId: string,
  envelope: GfinEnvelope,
): Promise<void> {
  await saveVault(vaultId, JSON.stringify(envelope));
}

export async function loadVaultEnvelope(
  vaultId: string,
): Promise<GfinEnvelope | null> {
  try {
    const raw = await loadVault(vaultId);
    return parseEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function hasVault(): Promise<boolean> {
  return (await listProfiles()).length > 0;
}
