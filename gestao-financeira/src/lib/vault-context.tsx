"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createEmptySnapshot,
  createMarinaDemoSnapshot,
  recordWealthSnapshot,
  type VaultSnapshot,
} from "@/domain";
import {
  buildUserProfile,
  commitLegacyMigration,
  createMarinaDemoProfile,
  decryptEnvelope,
  deleteProfileAndVault,
  downloadGfin,
  encryptSnapshot,
  getProfile,
  hasLegacyVault,
  listProfiles,
  loadLegacyEnvelope,
  loadVaultEnvelope,
  planLegacyMigration,
  putProfile,
  readGfinFile,
  resetMarinaDemoProfile,
  saveVaultEnvelope,
  slugifyProfileName,
  clearLegacyEnvelope,
  MARINA_DEMO_DISPLAY_NAME,
  MARINA_DEMO_PIN,
  MARINA_DEMO_PROFILE_ID,
  MARINA_DEMO_VAULT_ID,
  type ProfileAvatar,
  type ProfileKind,
  type UserProfile,
} from "@/adapters";

export type AuthStatus =
  | "loading"
  | "no_users"
  | "migrate_legacy"
  | "user_selection"
  | "pin_required"
  | "unlocked"
  | "error";

export type CreateProfileMode = "empty" | "demo";

export type ImportVaultMode = "new_user" | "replace_active";

interface VaultContextValue {
  status: AuthStatus;
  error: string | null;
  profiles: UserProfile[];
  /** Perfil selecionado para PIN / desbloqueado. */
  selectedProfile: UserProfile | null;
  /** Alias do perfil ativo quando unlocked. */
  activeProfile: UserProfile | null;
  snapshot: VaultSnapshot | null;
  clearError: () => void;
  refreshProfiles: () => Promise<void>;
  selectProfile: (profileId: string) => Promise<void>;
  clearSelectedProfile: () => void;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  switchUser: () => void;
  createProfile: (input: {
    name: string;
    pin: string;
    mode: CreateProfileMode;
    kind?: ProfileKind;
    avatar?: ProfileAvatar;
  }) => Promise<void>;
  createDemoOnboarding: (pin?: string) => Promise<void>;
  seedMarinaDemo: (opts?: { reset?: boolean; pin?: string }) => Promise<void>;
  /** Cria Marina se faltar, sem desbloquear (coexiste com outros usuários). */
  ensureMarinaAlongside: (pin?: string) => Promise<void>;
  createEmptyOnboarding: (name: string, pin: string) => Promise<void>;
  migrateLegacy: (input: { name: string; pin: string }) => Promise<void>;
  /** Descarta o cofre único antigo (sem PIN) e abre onboarding. */
  abandonLegacyVault: () => Promise<void>;
  renameProfile: (name: string) => Promise<void>;
  updateProfileMeta: (patch: {
    name?: string;
    displayName?: string;
    avatar?: ProfileAvatar;
  }) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  deleteProfile: (profileId: string, pin: string) => Promise<void>;
  updateSnapshot: (
    updater: (prev: VaultSnapshot) => VaultSnapshot,
  ) => Promise<void>;
  downloadVault: () => Promise<void>;
  importVault: (
    file: File,
    pin: string,
    opts: { mode: ImportVaultMode; name?: string },
  ) => Promise<void>;
  /** Compat: setupPin do fluxo antigo → cria usuário pessoal vazio. */
  setupPin: (pin: string) => Promise<void>;
  resetLocalVault: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

function clearSessionState(
  setSnapshot: (v: VaultSnapshot | null) => void,
  setPin: (v: string | null) => void,
) {
  setSnapshot(null);
  setPin(null);
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [pin, setPin] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    const list = await listProfiles();
    setProfiles(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listProfiles();
        if (cancelled) return;
        setProfiles(list);
        if (list.length > 0) {
          setStatus("user_selection");
          return;
        }
        if (await hasLegacyVault()) {
          setStatus("migrate_legacy");
          return;
        }
        setStatus("no_users");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar perfis");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const persistActive = useCallback(
    async (
      profile: UserProfile,
      next: VaultSnapshot,
      currentPin: string,
    ) => {
      const enc = await encryptSnapshot(next, currentPin);
      await saveVaultEnvelope(profile.vaultId, enc);
      setSnapshot(next);
    },
    [],
  );

  const selectProfile = useCallback(async (profileId: string) => {
    setError(null);
    const profile = await getProfile(profileId);
    if (!profile) {
      setError("Usuário não encontrado");
      return;
    }
    clearSessionState(setSnapshot, setPin);
    setSelectedProfile(profile);
    setStatus("pin_required");
  }, []);

  const clearSelectedProfile = useCallback(() => {
    clearSessionState(setSnapshot, setPin);
    setSelectedProfile(null);
    setStatus("user_selection");
  }, []);

  const unlock = useCallback(
    async (tryPin: string) => {
      setError(null);
      if (!selectedProfile) {
        setError("Selecione um usuário");
        throw new Error("Sem perfil");
      }
      const stored = await loadVaultEnvelope(selectedProfile.vaultId);
      if (!stored) {
        setError("Cofre do usuário não encontrado");
        throw new Error("Cofre ausente");
      }
      try {
        const data = await decryptEnvelope(stored, tryPin);
        const withWealth = recordWealthSnapshot(data);
        setSnapshot(withWealth);
        setPin(tryPin);
        setStatus("unlocked");
        if (withWealth !== data) {
          await persistActive(selectedProfile, withWealth, tryPin);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao desbloquear");
        throw e;
      }
    },
    [selectedProfile, persistActive],
  );

  const lock = useCallback(() => {
    clearSessionState(setSnapshot, setPin);
    if (selectedProfile) {
      setStatus("pin_required");
    } else if (profiles.length > 0) {
      setStatus("user_selection");
    } else {
      setStatus("no_users");
    }
  }, [selectedProfile, profiles.length]);

  const switchUser = useCallback(() => {
    clearSessionState(setSnapshot, setPin);
    setSelectedProfile(null);
    setStatus("user_selection");
  }, []);

  const createProfile = useCallback(
    async (input: {
      name: string;
      pin: string;
      mode: CreateProfileMode;
      kind?: ProfileKind;
      avatar?: ProfileAvatar;
    }) => {
      setError(null);
      if (input.pin.length < 4) {
        setError("O PIN deve ter pelo menos 4 dígitos");
        throw new Error("PIN curto");
      }
      const kind = input.kind ?? (input.mode === "demo" ? "demo" : "personal");
      const data =
        input.mode === "demo"
          ? createMarinaDemoSnapshot()
          : createEmptySnapshot();
      // Perfil demo oficial usa IDs estáveis
      const profile =
        input.mode === "demo" &&
        (input.name === MARINA_DEMO_DISPLAY_NAME ||
          input.name === "Apresentação")
          ? {
              id: MARINA_DEMO_PROFILE_ID,
              name: MARINA_DEMO_DISPLAY_NAME,
              displayName: "marina.demo",
              avatar: "demo" as const,
              vaultId: MARINA_DEMO_VAULT_ID,
              kind: "demo" as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : buildUserProfile({
              name: input.name,
              kind,
              avatar: input.avatar,
            });
      const enc = await encryptSnapshot(data, input.pin);
      await saveVaultEnvelope(profile.vaultId, enc);
      await putProfile(profile);
      await refreshProfiles();
      setSelectedProfile(profile);
      setSnapshot(data);
      setPin(input.pin);
      setStatus("unlocked");
    },
    [refreshProfiles],
  );

  const createDemoOnboarding = useCallback(
    async (newPin: string = MARINA_DEMO_PIN) => {
      // Idempotente: se Marina já existe, só desbloqueia o cofre fixo (não regenera).
      const result = await createMarinaDemoProfile(newPin);
      await refreshProfiles();
      const stored = await loadVaultEnvelope(result.profile.vaultId);
      if (!stored) {
        // Perfil órfão sem vault — aí sim recria uma vez
        await resetMarinaDemoProfile(newPin);
        const again = await loadVaultEnvelope(MARINA_DEMO_VAULT_ID);
        if (!again) throw new Error("Falha ao criar cofre da Marina");
        const data = await decryptEnvelope(again, newPin);
        setSelectedProfile(result.profile);
        setSnapshot(data);
        setPin(newPin);
        setStatus("unlocked");
        return;
      }
      try {
        const data = await decryptEnvelope(stored, newPin);
        setSelectedProfile(result.profile);
        setSnapshot(data);
        setPin(newPin);
        setStatus("unlocked");
      } catch {
        setError(
          "Não foi possível abrir o cofre da Marina com este PIN. Use o PIN 3247 ou redefina o perfil demo no Cofre.",
        );
        throw new Error("PIN Marina");
      }
    },
    [refreshProfiles],
  );

  /** Garante Marina no dispositivo sem trocar o usuário ativo. */
  const ensureMarinaAlongside = useCallback(
    async (pin: string = MARINA_DEMO_PIN) => {
      await createMarinaDemoProfile(pin);
      await refreshProfiles();
    },
    [refreshProfiles],
  );

  const seedMarinaDemo = useCallback(
    async (opts?: { reset?: boolean; pin?: string }) => {
      const pin = opts?.pin ?? MARINA_DEMO_PIN;
      const result = opts?.reset
        ? await resetMarinaDemoProfile(pin)
        : await createMarinaDemoProfile(pin);
      await refreshProfiles();
      if (
        status === "unlocked" &&
        selectedProfile?.id === MARINA_DEMO_PROFILE_ID
      ) {
        const stored = await loadVaultEnvelope(result.profile.vaultId);
        if (stored) {
          const data = await decryptEnvelope(stored, pin);
          setSnapshot(data);
          setPin(pin);
        }
      }
    },
    [refreshProfiles, status, selectedProfile],
  );

  const createEmptyOnboarding = useCallback(
    async (name: string, newPin: string) => {
      await createProfile({
        name: name || "Meu usuário",
        pin: newPin,
        mode: "empty",
        kind: "personal",
      });
    },
    [createProfile],
  );

  /** Compat com PinGate antigo. */
  const setupPin = useCallback(
    async (newPin: string) => {
      await createEmptyOnboarding("Meu usuário", newPin);
    },
    [createEmptyOnboarding],
  );

  const migrateLegacy = useCallback(
    async (input: { name: string; pin: string }) => {
      setError(null);
      const legacy = await loadLegacyEnvelope();
      if (!legacy) {
        setError("Cofre legado não encontrado");
        throw new Error("Sem legado");
      }
      try {
        const data = await decryptEnvelope(legacy, input.pin);
        const { profile } = planLegacyMigration({ name: input.name });
        await commitLegacyMigration(profile, legacy);
        // Marina fica disponível ao lado, com dados fixos (sem regenerar se já existir)
        await createMarinaDemoProfile(MARINA_DEMO_PIN);
        await refreshProfiles();
        const withWealth = recordWealthSnapshot(data);
        setSelectedProfile(profile);
        setSnapshot(withWealth);
        setPin(input.pin);
        setStatus("unlocked");
        if (withWealth !== data) {
          await persistActive(profile, withWealth, input.pin);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message === "PIN incorreto ou cofre corrompido"
              ? "PIN incorreto. Use o PIN antigo deste cofre (não o da demonstração Marina, a menos que seja o mesmo)."
              : e.message
            : "Falha na migração",
        );
        throw e;
      }
    },
    [refreshProfiles, persistActive],
  );

  const abandonLegacyVault = useCallback(async () => {
    setError(null);
    await clearLegacyEnvelope();
    clearSessionState(setSnapshot, setPin);
    setSelectedProfile(null);
    const list = await listProfiles();
    setProfiles(list);
    setStatus(list.length > 0 ? "user_selection" : "no_users");
  }, []);

  const updateSnapshot = useCallback(
    async (updater: (prev: VaultSnapshot) => VaultSnapshot) => {
      if (!snapshot || !pin || !selectedProfile) {
        throw new Error("Cofre bloqueado");
      }
      const next = updater(snapshot);
      await persistActive(selectedProfile, next, pin);
    },
    [snapshot, pin, selectedProfile, persistActive],
  );

  const renameProfile = useCallback(
    async (name: string) => {
      if (!selectedProfile) throw new Error("Sem usuário ativo");
      const next: UserProfile = {
        ...selectedProfile,
        name: name.trim() || selectedProfile.name,
        updatedAt: new Date().toISOString(),
      };
      await putProfile(next);
      setSelectedProfile(next);
      await refreshProfiles();
    },
    [selectedProfile, refreshProfiles],
  );

  const updateProfileMeta = useCallback(
    async (patch: {
      name?: string;
      displayName?: string;
      avatar?: ProfileAvatar;
    }) => {
      if (!selectedProfile) throw new Error("Sem usuário ativo");
      const next: UserProfile = {
        ...selectedProfile,
        name: patch.name?.trim() || selectedProfile.name,
        displayName:
          patch.displayName !== undefined
            ? patch.displayName.trim() || undefined
            : selectedProfile.displayName,
        avatar: patch.avatar ?? selectedProfile.avatar,
        updatedAt: new Date().toISOString(),
      };
      await putProfile(next);
      setSelectedProfile(next);
      await refreshProfiles();
    },
    [selectedProfile, refreshProfiles],
  );

  const changePin = useCallback(
    async (currentPin: string, newPin: string) => {
      setError(null);
      if (!selectedProfile || !snapshot) {
        throw new Error("Desbloqueie o cofre para alterar o PIN");
      }
      if (newPin.length < 4) {
        setError("O novo PIN deve ter pelo menos 4 dígitos");
        throw new Error("PIN curto");
      }
      // Valida PIN atual re-descriptografando o envelope
      const stored = await loadVaultEnvelope(selectedProfile.vaultId);
      if (!stored) throw new Error("Cofre não encontrado");
      await decryptEnvelope(stored, currentPin);
      await persistActive(selectedProfile, snapshot, newPin);
      setPin(newPin);
    },
    [selectedProfile, snapshot, persistActive],
  );

  const deleteProfile = useCallback(
    async (profileId: string, tryPin: string) => {
      setError(null);
      const profile = await getProfile(profileId);
      if (!profile) throw new Error("Usuário não encontrado");
      const stored = await loadVaultEnvelope(profile.vaultId);
      if (!stored) throw new Error("Cofre não encontrado");
      await decryptEnvelope(stored, tryPin);
      await deleteProfileAndVault(profile.id, profile.vaultId);

      const wasActive = selectedProfile?.id === profileId;
      if (wasActive) {
        clearSessionState(setSnapshot, setPin);
        setSelectedProfile(null);
      }
      const remaining = await listProfiles();
      setProfiles(remaining);
      if (remaining.length === 0) {
        setStatus("no_users");
      } else if (wasActive) {
        setStatus("user_selection");
      }
    },
    [selectedProfile],
  );

  const downloadVault = useCallback(async () => {
    if (!pin || !snapshot || !selectedProfile) {
      throw new Error("Desbloqueie o cofre para baixar");
    }
    const enc = await encryptSnapshot(snapshot, pin);
    await saveVaultEnvelope(selectedProfile.vaultId, enc);
    const slug = slugifyProfileName(selectedProfile.name);
    downloadGfin(enc, `${slug}.gfin`);
  }, [pin, snapshot, selectedProfile]);

  const importVault = useCallback(
    async (
      file: File,
      importPin: string,
      opts: { mode: ImportVaultMode; name?: string },
    ) => {
      setError(null);
      const imported = await readGfinFile(file);
      const data = await decryptEnvelope(imported, importPin);

      if (opts.mode === "replace_active") {
        if (!selectedProfile) {
          throw new Error("Nenhum usuário ativo para substituir");
        }
        await saveVaultEnvelope(selectedProfile.vaultId, imported);
        setSnapshot(data);
        setPin(importPin);
        setStatus("unlocked");
        return;
      }

      const name =
        opts.name?.trim() ||
        file.name.replace(/\.gfin$/i, "") ||
        "Importado";
      const profile = buildUserProfile({
        name,
        kind: "personal",
        avatar: "user",
      });
      await saveVaultEnvelope(profile.vaultId, imported);
      await putProfile(profile);
      await refreshProfiles();
      setSelectedProfile(profile);
      setSnapshot(data);
      setPin(importPin);
      setStatus("unlocked");
    },
    [selectedProfile, refreshProfiles],
  );

  const resetLocalVault = useCallback(async () => {
    if (selectedProfile && pin) {
      try {
        await deleteProfile(selectedProfile.id, pin);
        return;
      } catch {
        /* fall through */
      }
    }
    clearSessionState(setSnapshot, setPin);
    setSelectedProfile(null);
    const list = await listProfiles();
    setProfiles(list);
    setStatus(list.length > 0 ? "user_selection" : "no_users");
  }, [selectedProfile, pin, deleteProfile]);

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      error,
      profiles,
      selectedProfile,
      activeProfile: status === "unlocked" ? selectedProfile : null,
      snapshot,
      clearError,
      refreshProfiles: async () => {
        await refreshProfiles();
      },
      selectProfile,
      clearSelectedProfile,
      unlock,
      lock,
      switchUser,
      createProfile,
      createDemoOnboarding,
      seedMarinaDemo,
      ensureMarinaAlongside,
      createEmptyOnboarding,
      migrateLegacy,
      abandonLegacyVault,
      renameProfile,
      updateProfileMeta,
      changePin,
      deleteProfile,
      updateSnapshot,
      downloadVault,
      importVault,
      setupPin,
      resetLocalVault,
    }),
    [
      status,
      error,
      profiles,
      selectedProfile,
      snapshot,
      clearError,
      refreshProfiles,
      selectProfile,
      clearSelectedProfile,
      unlock,
      lock,
      switchUser,
      createProfile,
      createDemoOnboarding,
      seedMarinaDemo,
      ensureMarinaAlongside,
      createEmptyOnboarding,
      migrateLegacy,
      abandonLegacyVault,
      renameProfile,
      updateProfileMeta,
      changePin,
      deleteProfile,
      updateSnapshot,
      downloadVault,
      importVault,
      setupPin,
      resetLocalVault,
    ],
  );

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault deve ser usado dentro de VaultProvider");
  return ctx;
}

/** Helper testável: zera snapshot/pin de uma sessão. */
export function createEmptySession() {
  return { snapshot: null as VaultSnapshot | null, pin: null as string | null };
}
