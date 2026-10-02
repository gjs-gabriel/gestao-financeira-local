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
  createAdminProfile,
  assertUniqueLogin,
  validateDisplayName,
  validateLogin,
  MARINA_DEMO_DISPLAY_NAME,
  MARINA_DEMO_PIN,
  MARINA_DEMO_PROFILE_ID,
  MARINA_DEMO_VAULT_ID,
  type ProfileAvatar,
  type ProfileKind,
  type UserProfile,
} from "@/adapters";
import {
  assertAdminCanEditTarget,
  assertAdminCanWipeTarget,
  toAdminVisibleProfile,
} from "@/domain/admin-profile";
import {
  bumpSessionActivity,
  clearPinFailures,
  clearVaultSession,
  clampIdleMs,
  establishVaultSession,
  getPinThrottleStatus,
  getSessionPin,
  recordPinFailure,
  SESSION_IDLE_MS_DEFAULT,
  setSessionIdleHandler,
  setSessionIdleMs,
} from "@/security";
import { getRuntimeManager } from "@/ai/local/RuntimeManager";

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
    /** Login sem espaços */
    login: string;
    pin: string;
    mode: CreateProfileMode;
    kind?: ProfileKind;
    avatar?: ProfileAvatar;
  }) => Promise<void>;
  createDemoOnboarding: (pin?: string) => Promise<void>;
  seedMarinaDemo: (opts?: { reset?: boolean; pin?: string }) => Promise<void>;
  /** Cria Marina se faltar, sem desbloquear (coexiste com outros usuários). */
  ensureMarinaAlongside: (pin?: string) => Promise<void>;
  createEmptyOnboarding: (
    name: string,
    login: string,
    pin: string,
  ) => Promise<void>;
  migrateLegacy: (input: {
    name: string;
    login: string;
    pin: string;
  }) => Promise<void>;
  /** Descarta o cofre único antigo (sem PIN) e abre onboarding. */
  abandonLegacyVault: () => Promise<void>;
  renameProfile: (name: string) => Promise<void>;
  updateProfileMeta: (patch: {
    name?: string;
    avatar?: ProfileAvatar;
  }) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  deleteProfile: (profileId: string, pin: string) => Promise<void>;
  /**
   * Admin: apaga perfil/cofre alheio sem descriptografar.
   * Exige PIN do admin (prova de identidade), nunca o PIN da vítima.
   */
  adminWipeProfile: (targetProfileId: string, adminPin: string) => Promise<void>;
  /**
   * Admin: altera nome e/ou login de outro usuário (só metadados públicos).
   * Não abre o cofre do alvo.
   */
  adminUpdateUserProfile: (
    targetProfileId: string,
    patch: { name?: string; login?: string },
  ) => Promise<void>;
  /** Metadados públicos dos perfis (sem abrir cofres). */
  listProfilesForAdmin: () => ReturnType<typeof toAdminVisibleProfile>[];
  createAdminOnboarding: (pin: string) => Promise<void>;
  ensureAdminAlongside: (pin: string) => Promise<void>;
  isAdminSession: boolean;
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

function wipeUnlockedMemory(
  setSnapshot: (v: VaultSnapshot | null) => void,
) {
  setSnapshot(null);
  clearVaultSession();
  try {
    getRuntimeManager().getClient().setToken(null);
    getRuntimeManager().cancel();
  } catch {
    /* runtime opcional */
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  // PIN NÃO fica em React state — só em vault-session (memória de processo)

  useEffect(() => {
    setSessionIdleMs(clampIdleMs(SESSION_IDLE_MS_DEFAULT));
    setSessionIdleHandler(() => {
      wipeUnlockedMemory(setSnapshot);
      setStatus((prev) =>
        prev === "unlocked" ? "pin_required" : prev,
      );
      setError("Cofre bloqueado por inatividade.");
    });
    return () => {
      setSessionIdleHandler(null);
      clearVaultSession();
    };
  }, []);

  useEffect(() => {
    if (status !== "unlocked") return;
    const onActivity = () => bumpSessionActivity();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [status]);

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
    wipeUnlockedMemory(setSnapshot);
    setSelectedProfile(profile);
    setStatus("pin_required");
  }, []);

  const clearSelectedProfile = useCallback(() => {
    wipeUnlockedMemory(setSnapshot);
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
      const throttle = getPinThrottleStatus(selectedProfile.vaultId);
      if (throttle.blocked) {
        setError(throttle.message ?? "Aguarde antes de tentar novamente.");
        throw new Error("pin_throttled");
      }
      const stored = await loadVaultEnvelope(selectedProfile.vaultId);
      if (!stored) {
        setError("Cofre do usuário não encontrado");
        throw new Error("Cofre ausente");
      }
      try {
        const data = await decryptEnvelope(stored, tryPin);
        clearPinFailures(selectedProfile.vaultId);
        const withWealth = recordWealthSnapshot(data);
        establishVaultSession(selectedProfile.vaultId, tryPin);
        setSnapshot(withWealth);
        setStatus("unlocked");
        if (withWealth !== data) {
          await persistActive(selectedProfile, withWealth, tryPin);
        }
      } catch (e) {
        if ((e as Error)?.message !== "pin_throttled") {
          recordPinFailure(selectedProfile.vaultId);
          const again = getPinThrottleStatus(selectedProfile.vaultId);
          setError(
            again.message ??
              (e instanceof Error ? e.message : "Falha ao desbloquear"),
          );
        }
        throw e;
      }
    },
    [selectedProfile, persistActive],
  );

  const lock = useCallback(() => {
    wipeUnlockedMemory(setSnapshot);
    setError(null);
    if (selectedProfile) {
      setStatus("pin_required");
    } else if (profiles.length > 0) {
      setStatus("user_selection");
    } else {
      setStatus("no_users");
    }
  }, [selectedProfile, profiles.length]);

  const switchUser = useCallback(() => {
    wipeUnlockedMemory(setSnapshot);
    setSelectedProfile(null);
    setStatus("user_selection");
  }, []);

  const createProfile = useCallback(
    async (input: {
      name: string;
      login: string;
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
      const nameCheck = validateDisplayName(input.name);
      if (!nameCheck.ok) {
        setError(nameCheck.error);
        throw new Error(nameCheck.error);
      }
      const loginCheck = validateLogin(input.login);
      if (!loginCheck.ok) {
        setError(loginCheck.error);
        throw new Error(loginCheck.error);
      }
      const existing = await listProfiles();
      try {
        assertUniqueLogin(loginCheck.value, existing);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Login em uso";
        setError(msg);
        throw e;
      }

      const kind = input.kind ?? (input.mode === "demo" ? "demo" : "personal");
      const data =
        input.mode === "demo"
          ? createMarinaDemoSnapshot()
          : createEmptySnapshot();
      // Perfil demo oficial usa IDs estáveis
      const profile =
        input.mode === "demo" &&
        (nameCheck.value === MARINA_DEMO_DISPLAY_NAME ||
          nameCheck.value === "Apresentação")
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
              name: nameCheck.value,
              login: loginCheck.value,
              kind,
              avatar: input.avatar,
            });
      const enc = await encryptSnapshot(data, input.pin);
      await saveVaultEnvelope(profile.vaultId, enc);
      await putProfile(profile);
      await refreshProfiles();
      setSelectedProfile(profile);
      establishVaultSession(profile.vaultId, input.pin);
      setSnapshot(data);
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
        establishVaultSession(MARINA_DEMO_VAULT_ID, newPin);
        setStatus("unlocked");
        return;
      }
      try {
        const data = await decryptEnvelope(stored, newPin);
        setSelectedProfile(result.profile);
        setSnapshot(data);
        establishVaultSession(MARINA_DEMO_VAULT_ID, newPin);
        setStatus("unlocked");
      } catch {
        setError(
          "Não foi possível abrir o cofre da Marina com este PIN. Redefina o perfil demo no Cofre se necessário.",
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
          establishVaultSession(MARINA_DEMO_VAULT_ID, pin);
        }
      }
    },
    [refreshProfiles, status, selectedProfile],
  );

  const createEmptyOnboarding = useCallback(
    async (name: string, login: string, newPin: string) => {
      await createProfile({
        name: name || "Meu usuário",
        login,
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
      await createEmptyOnboarding("Meu usuário", "meu.usuario", newPin);
    },
    [createEmptyOnboarding],
  );

  const migrateLegacy = useCallback(
    async (input: { name: string; login: string; pin: string }) => {
      setError(null);
      const legacy = await loadLegacyEnvelope();
      if (!legacy) {
        setError("Cofre legado não encontrado");
        throw new Error("Sem legado");
      }
      try {
        const data = await decryptEnvelope(legacy, input.pin);
        const { profile } = planLegacyMigration({
          name: input.name,
          login: input.login,
        });
        await commitLegacyMigration(profile, legacy);
        // Marina fica disponível ao lado, com dados fixos (sem regenerar se já existir)
        await createMarinaDemoProfile(MARINA_DEMO_PIN);
        await refreshProfiles();
        const withWealth = recordWealthSnapshot(data);
        setSelectedProfile(profile);
        establishVaultSession(profile.vaultId, input.pin);
        setSnapshot(withWealth);
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
    wipeUnlockedMemory(setSnapshot);
    setSelectedProfile(null);
    const list = await listProfiles();
    setProfiles(list);
    setStatus(list.length > 0 ? "user_selection" : "no_users");
  }, []);

  const updateSnapshot = useCallback(
    async (updater: (prev: VaultSnapshot) => VaultSnapshot) => {
      const pin = getSessionPin(selectedProfile?.vaultId);
      if (!snapshot || !pin || !selectedProfile) {
        throw new Error("Cofre bloqueado");
      }
      bumpSessionActivity();
      const next = updater(snapshot);
      await persistActive(selectedProfile, next, pin);
    },
    [snapshot, selectedProfile, persistActive],
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
      avatar?: ProfileAvatar;
    }) => {
      if (!selectedProfile) throw new Error("Sem usuário ativo");

      let name = selectedProfile.name;
      if (patch.name !== undefined) {
        const nameCheck = validateDisplayName(patch.name);
        if (!nameCheck.ok) throw new Error(nameCheck.error);
        name = nameCheck.value;
      }

      // Login (displayName) é imutável após a criação.
      const next: UserProfile = {
        ...selectedProfile,
        name,
        displayName: selectedProfile.displayName,
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
      establishVaultSession(selectedProfile.vaultId, newPin);
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
        wipeUnlockedMemory(setSnapshot);
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

  /**
   * Exclusão administrativa: valida só o PIN do admin.
   * O envelope da vítima é apagado sem decrypt — admin não vê os dados.
   */
  const adminWipeProfile = useCallback(
    async (targetProfileId: string, adminPin: string) => {
      setError(null);
      if (status !== "unlocked" || selectedProfile?.kind !== "admin") {
        throw new Error("Sessão de administrador necessária.");
      }
      const target = await getProfile(targetProfileId);
      if (!target) throw new Error("Usuário não encontrado");

      assertAdminCanWipeTarget({
        actorKind: selectedProfile.kind,
        actorId: selectedProfile.id,
        targetId: target.id,
        targetKind: target.kind,
      });

      const adminEnvelope = await loadVaultEnvelope(selectedProfile.vaultId);
      if (!adminEnvelope) throw new Error("Cofre do administrador não encontrado");
      // Prova identidade do admin — NÃO abre o cofre da vítima.
      await decryptEnvelope(adminEnvelope, adminPin);

      // Apaga bytes cifrados sem jamais parsear o snapshot da vítima.
      await deleteProfileAndVault(target.id, target.vaultId);

      const remaining = await listProfiles();
      setProfiles(remaining);
    },
    [status, selectedProfile],
  );

  const adminUpdateUserProfile = useCallback(
    async (
      targetProfileId: string,
      patch: { name?: string; login?: string },
    ) => {
      setError(null);
      if (status !== "unlocked" || selectedProfile?.kind !== "admin") {
        throw new Error("Sessão de administrador necessária.");
      }
      const target = await getProfile(targetProfileId);
      if (!target) throw new Error("Usuário não encontrado");

      assertAdminCanEditTarget({
        actorKind: selectedProfile.kind,
        actorId: selectedProfile.id,
        targetId: target.id,
        targetKind: target.kind,
      });

      let name = target.name;
      if (patch.name !== undefined) {
        const nameCheck = validateDisplayName(patch.name);
        if (!nameCheck.ok) throw new Error(nameCheck.error);
        name = nameCheck.value;
      }

      let login = target.displayName;
      if (patch.login !== undefined) {
        const loginCheck = validateLogin(patch.login);
        if (!loginCheck.ok) throw new Error(loginCheck.error);
        const existing = await listProfiles();
        assertUniqueLogin(loginCheck.value, existing, target.id);
        login = loginCheck.value;
      }

      const next: UserProfile = {
        ...target,
        name,
        displayName: login,
        updatedAt: new Date().toISOString(),
      };
      await putProfile(next);
      await refreshProfiles();
    },
    [status, selectedProfile, refreshProfiles],
  );

  const listProfilesForAdmin = useCallback(() => {
    return profiles
      .filter((p) => p.id !== selectedProfile?.id)
      .map((p) => toAdminVisibleProfile(p));
  }, [profiles, selectedProfile]);

  const createAdminOnboarding = useCallback(
    async (pin: string) => {
      setError(null);
      const result = await createAdminProfile(pin);
      await refreshProfiles();
      const stored = await loadVaultEnvelope(result.profile.vaultId);
      if (!stored) throw new Error("Falha ao criar cofre do administrador");
      const data = await decryptEnvelope(stored, pin);
      setSelectedProfile(result.profile);
      establishVaultSession(result.profile.vaultId, pin);
      setSnapshot(data);
      setStatus("unlocked");
    },
    [refreshProfiles],
  );

  const ensureAdminAlongside = useCallback(
    async (pin: string) => {
      await createAdminProfile(pin);
      await refreshProfiles();
    },
    [refreshProfiles],
  );

  const isAdminSession =
    status === "unlocked" && selectedProfile?.kind === "admin";

  const downloadVault = useCallback(async () => {
    const pin = getSessionPin(selectedProfile?.vaultId);
    if (!pin || !snapshot || !selectedProfile) {
      throw new Error("Desbloqueie o cofre para baixar");
    }
    const enc = await encryptSnapshot(snapshot, pin);
    await saveVaultEnvelope(selectedProfile.vaultId, enc);
    const slug = slugifyProfileName(selectedProfile.name);
    downloadGfin(enc, `${slug}.gfin`);
  }, [snapshot, selectedProfile]);

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
        establishVaultSession(selectedProfile.vaultId, importPin);
        setSnapshot(data);
        setStatus("unlocked");
        return;
      }

      const name =
        opts.name?.trim() ||
        file.name.replace(/\.gfin$/i, "") ||
        "Importado";
      const derivedLogin =
        name
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/\s+/g, ".")
          .replace(/[^a-z0-9._-]/g, "")
          .replace(/^\.+|\.+$/g, "")
          .slice(0, 28) || "importado";
      const login = /^[a-z]/.test(derivedLogin)
        ? derivedLogin
        : `u.${derivedLogin}`;
      const existing = await listProfiles();
      let uniqueLogin = login;
      let n = 2;
      while (
        existing.some(
          (p) =>
            p.displayName &&
            p.displayName.toLowerCase() === uniqueLogin.toLowerCase(),
        )
      ) {
        uniqueLogin = `${login.slice(0, 28)}${n}`;
        n += 1;
      }
      const profile = buildUserProfile({
        name,
        login: uniqueLogin,
        kind: "personal",
        avatar: "user",
      });
      await saveVaultEnvelope(profile.vaultId, imported);
      await putProfile(profile);
      await refreshProfiles();
      setSelectedProfile(profile);
      establishVaultSession(profile.vaultId, importPin);
      setSnapshot(data);
      setStatus("unlocked");
    },
    [selectedProfile, refreshProfiles],
  );

  const resetLocalVault = useCallback(async () => {
    const pin = getSessionPin(selectedProfile?.vaultId);
    if (selectedProfile && pin) {
      try {
        await deleteProfile(selectedProfile.id, pin);
        return;
      } catch {
        /* fall through */
      }
    }
    wipeUnlockedMemory(setSnapshot);
    setSelectedProfile(null);
    const list = await listProfiles();
    setProfiles(list);
    setStatus(list.length > 0 ? "user_selection" : "no_users");
  }, [selectedProfile, deleteProfile]);

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
      adminWipeProfile,
      adminUpdateUserProfile,
      listProfilesForAdmin,
      createAdminOnboarding,
      ensureAdminAlongside,
      isAdminSession,
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
      adminWipeProfile,
      adminUpdateUserProfile,
      listProfilesForAdmin,
      createAdminOnboarding,
      ensureAdminAlongside,
      isAdminSession,
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
  clearVaultSession();
  return { snapshot: null as VaultSnapshot | null, pin: null as string | null };
}
