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
} from "@gf/core";
import {
  buildUserProfile,
  decryptEnvelope,
  deleteProfileAndVault,
  downloadGfin,
  encryptSnapshot,
  ensureMarinaDemoProfile,
  getProfile,
  listProfiles,
  loadVaultEnvelope,
  pickAndReadGfin,
  putProfile,
  saveVaultEnvelope,
  type CryptoProgressHandler,
  type UserProfile,
} from "../adapters";

export type AuthStatus =
  | "loading"
  | "no_users"
  | "user_selection"
  | "pin_required"
  | "unlocked"
  | "error";

interface VaultContextValue {
  status: AuthStatus;
  error: string | null;
  profiles: UserProfile[];
  selectedProfile: UserProfile | null;
  activeProfile: UserProfile | null;
  snapshot: VaultSnapshot | null;
  clearError: () => void;
  refreshProfiles: () => Promise<void>;
  selectProfile: (profileId: string) => Promise<void>;
  clearSelectedProfile: () => void;
  unlock: (
    pin: string,
    onProgress?: CryptoProgressHandler,
  ) => Promise<void>;
  lock: () => void;
  createProfile: (input: {
    name: string;
    login: string;
    pin: string;
    mode: "empty" | "demo";
  }) => Promise<void>;
  persistSnapshot: (next: VaultSnapshot) => Promise<void>;
  updateSnapshot: (fn: (s: VaultSnapshot) => VaultSnapshot) => Promise<void>;
  exportVault: () => Promise<void>;
  importVaultAsNewUser: (input: {
    name: string;
    login: string;
    pin: string;
  }) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  deleteProfile: (profileId: string, pin: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [sessionPin, setSessionPin] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    const list = await listProfiles();
    setProfiles(list);
    if (list.length === 0) setStatus("no_users");
    else if (status === "loading" || status === "no_users") {
      setStatus("user_selection");
    }
  }, [status]);

  useEffect(() => {
    void (async () => {
      try {
        await ensureMarinaDemoProfile();
        await refreshProfiles();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar perfils");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProfile = useCallback(async (profileId: string) => {
    const p = await getProfile(profileId);
    if (!p) throw new Error("Perfil não encontrado.");
    setSelectedProfile(p);
    setStatus("pin_required");
    setError(null);
  }, []);

  const clearSelectedProfile = useCallback(() => {
    setSelectedProfile(null);
    setStatus(profiles.length ? "user_selection" : "no_users");
  }, [profiles.length]);

  const unlock = useCallback(
    async (pin: string, onProgress?: CryptoProgressHandler) => {
      if (!selectedProfile) throw new Error("Selecione um perfil.");
      setError(null);
      onProgress?.("preparing");
      const env = await loadVaultEnvelope(selectedProfile.vaultId);
      if (!env) throw new Error("Cofre não encontrado neste aparelho.");
      const snap = await decryptEnvelope(env, pin, onProgress);
      setSnapshot(snap);
      setSessionPin(pin);
      setStatus("unlocked");
    },
    [selectedProfile],
  );

  const lock = useCallback(() => {
    setSnapshot(null);
    setSessionPin(null);
    setStatus(selectedProfile ? "pin_required" : "user_selection");
  }, [selectedProfile]);

  const persistSnapshot = useCallback(
    async (next: VaultSnapshot) => {
      if (!selectedProfile || !sessionPin) {
        throw new Error("Sessão bloqueada.");
      }
      const withWealth = recordWealthSnapshot(next, new Date());
      const env = await encryptSnapshot(withWealth, sessionPin);
      await saveVaultEnvelope(selectedProfile.vaultId, env);
      setSnapshot(withWealth);
    },
    [selectedProfile, sessionPin],
  );

  const updateSnapshot = useCallback(
    async (fn: (s: VaultSnapshot) => VaultSnapshot) => {
      if (!snapshot) throw new Error("Cofre bloqueado.");
      await persistSnapshot(fn(snapshot));
    },
    [snapshot, persistSnapshot],
  );

  const createProfile = useCallback(
    async (input: {
      name: string;
      login: string;
      pin: string;
      mode: "empty" | "demo";
    }) => {
      const profile = buildUserProfile({
        name: input.name,
        login: input.login,
        kind: input.mode === "demo" ? "demo" : "personal",
      });
      const snap =
        input.mode === "demo"
          ? createMarinaDemoSnapshot()
          : createEmptySnapshot();
      const env = await encryptSnapshot(snap, input.pin);
      await putProfile(profile);
      await saveVaultEnvelope(profile.vaultId, env);
      await refreshProfiles();
      setSelectedProfile(profile);
      setSnapshot(snap);
      setSessionPin(input.pin);
      setStatus("unlocked");
    },
    [refreshProfiles],
  );

  const exportVault = useCallback(async () => {
    if (!selectedProfile || !sessionPin || !snapshot) {
      throw new Error("Desbloqueie o cofre para exportar.");
    }
    const env = await encryptSnapshot(snapshot, sessionPin);
    await downloadGfin(env, selectedProfile.name);
  }, [selectedProfile, sessionPin, snapshot]);

  const importVaultAsNewUser = useCallback(
    async (input: { name: string; login: string; pin: string }) => {
      const env = await pickAndReadGfin();
      const snap = await decryptEnvelope(env, input.pin);
      const profile = buildUserProfile({
        name: input.name,
        login: input.login,
        kind: "personal",
      });
      await putProfile(profile);
      await saveVaultEnvelope(profile.vaultId, env);
      await refreshProfiles();
      setSelectedProfile(profile);
      setSnapshot(snap);
      setSessionPin(input.pin);
      setStatus("unlocked");
    },
    [refreshProfiles],
  );

  const changePin = useCallback(
    async (currentPin: string, newPin: string) => {
      if (!selectedProfile || !snapshot) throw new Error("Sessão inválida.");
      // Prove current PIN by re-decrypting stored envelope
      const env = await loadVaultEnvelope(selectedProfile.vaultId);
      if (!env) throw new Error("Cofre ausente.");
      await decryptEnvelope(env, currentPin);
      const nextEnv = await encryptSnapshot(snapshot, newPin);
      await saveVaultEnvelope(selectedProfile.vaultId, nextEnv);
      setSessionPin(newPin);
    },
    [selectedProfile, snapshot],
  );

  const deleteProfile = useCallback(
    async (profileId: string, pin: string) => {
      const p = await getProfile(profileId);
      if (!p) throw new Error("Perfil não encontrado.");
      const env = await loadVaultEnvelope(p.vaultId);
      if (env) await decryptEnvelope(env, pin);
      await deleteProfileAndVault(profileId);
      setSnapshot(null);
      setSessionPin(null);
      setSelectedProfile(null);
      await refreshProfiles();
      setStatus("user_selection");
    },
    [refreshProfiles],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      error,
      profiles,
      selectedProfile,
      activeProfile: status === "unlocked" ? selectedProfile : null,
      snapshot,
      clearError: () => setError(null),
      refreshProfiles,
      selectProfile,
      clearSelectedProfile,
      unlock: async (pin) => {
        try {
          await unlock(pin);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha ao desbloquear");
          throw e;
        }
      },
      lock,
      createProfile,
      persistSnapshot,
      updateSnapshot,
      exportVault,
      importVaultAsNewUser,
      changePin,
      deleteProfile,
    }),
    [
      status,
      error,
      profiles,
      selectedProfile,
      snapshot,
      refreshProfiles,
      selectProfile,
      clearSelectedProfile,
      unlock,
      lock,
      createProfile,
      persistSnapshot,
      updateSnapshot,
      exportVault,
      importVaultAsNewUser,
      changePin,
      deleteProfile,
    ],
  );

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault fora de VaultProvider");
  return ctx;
}
