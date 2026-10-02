import fs from "node:fs";

const p = "src/lib/vault-context.tsx";
let s = fs.readFileSync(p, "utf8");

s = s.replaceAll(
  "clearSessionState(setSnapshot, setPin);",
  "wipeUnlockedMemory(setSnapshot);",
);

s = s.replace(
  `setSelectedProfile(profile);
      setSnapshot(data);
      setPin(input.pin);
      setStatus("unlocked");`,
  `setSelectedProfile(profile);
      setSnapshot(data);
      establishVaultSession(profile.vaultId, input.pin);
      setStatus("unlocked");`,
);

s = s.replaceAll(
  `setSelectedProfile(result.profile);
        setSnapshot(data);
        setPin(newPin);
        setStatus("unlocked");`,
  `setSelectedProfile(result.profile);
        setSnapshot(data);
        establishVaultSession(result.profile.vaultId, newPin);
        setStatus("unlocked");`,
);

s = s.replace(
  `const data = await decryptEnvelope(stored, pin);
          setSnapshot(data);
          setPin(pin);`,
  `const data = await decryptEnvelope(stored, pin);
          setSnapshot(data);
          establishVaultSession(result.profile.vaultId, pin);`,
);

s = s.replace(
  `setSelectedProfile(profile);
        setSnapshot(withWealth);
        setPin(input.pin);
        setStatus("unlocked");`,
  `setSelectedProfile(profile);
        setSnapshot(withWealth);
        establishVaultSession(profile.vaultId, input.pin);
        setStatus("unlocked");`,
);

s = s.replace(
  `await saveVaultEnvelope(selectedProfile.vaultId, imported);
        setSnapshot(data);
        setPin(importPin);
        setStatus("unlocked");`,
  `await saveVaultEnvelope(selectedProfile.vaultId, imported);
        setSnapshot(data);
        establishVaultSession(selectedProfile.vaultId, importPin);
        setStatus("unlocked");`,
);

s = s.replace(
  `setSelectedProfile(profile);
      setSnapshot(data);
      setPin(importPin);
      setStatus("unlocked");`,
  `setSelectedProfile(profile);
      setSnapshot(data);
      establishVaultSession(profile.vaultId, importPin);
      setStatus("unlocked");`,
);

s = s.replace(
  `await persistActive(selectedProfile, snapshot, newPin);
      setPin(newPin);`,
  `await persistActive(selectedProfile, snapshot, newPin);
      establishVaultSession(selectedProfile.vaultId, newPin);`,
);

s = s.replace(
  `async (updater: (prev: VaultSnapshot) => VaultSnapshot) => {
      if (!snapshot || !pin || !selectedProfile) {
        throw new Error("Cofre bloqueado");
      }
      const next = updater(snapshot);
      await persistActive(selectedProfile, next, pin);
    },
    [snapshot, pin, selectedProfile, persistActive],`,
  `async (updater: (prev: VaultSnapshot) => VaultSnapshot) => {
      const sessionPin = selectedProfile
        ? getSessionPin(selectedProfile.vaultId)
        : null;
      if (!snapshot || !sessionPin || !selectedProfile) {
        throw new Error("Cofre bloqueado");
      }
      bumpSessionActivity();
      const next = updater(snapshot);
      await persistActive(selectedProfile, next, sessionPin);
    },
    [snapshot, selectedProfile, persistActive],`,
);

s = s.replace(
  `const downloadVault = useCallback(async () => {
    if (!pin || !snapshot || !selectedProfile) {
      throw new Error("Desbloqueie o cofre para baixar");
    }
    const enc = await encryptSnapshot(snapshot, pin);
    await saveVaultEnvelope(selectedProfile.vaultId, enc);
    const slug = slugifyProfileName(selectedProfile.name);
    downloadGfin(enc, \`\${slug}.gfin\`);
  }, [pin, snapshot, selectedProfile]);`,
  `const downloadVault = useCallback(async () => {
    const sessionPin = selectedProfile
      ? getSessionPin(selectedProfile.vaultId)
      : null;
    if (!sessionPin || !snapshot || !selectedProfile) {
      throw new Error("Desbloqueie o cofre para baixar");
    }
    bumpSessionActivity();
    const enc = await encryptSnapshot(snapshot, sessionPin);
    await saveVaultEnvelope(selectedProfile.vaultId, enc);
    const slug = slugifyProfileName(selectedProfile.name);
    downloadGfin(enc, \`\${slug}.gfin\`);
  }, [snapshot, selectedProfile]);`,
);

s = s.replace(
  `const resetLocalVault = useCallback(async () => {
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
  }, [selectedProfile, pin, deleteProfile]);`,
  `const resetLocalVault = useCallback(async () => {
    const sessionPin = selectedProfile
      ? getSessionPin(selectedProfile.vaultId)
      : null;
    if (selectedProfile && sessionPin) {
      try {
        await deleteProfile(selectedProfile.id, sessionPin);
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
  }, [selectedProfile, deleteProfile]);`,
);

s = s.replace(
  "Não foi possível abrir o cofre da Marina com este PIN. Use o PIN 3247 ou redefina o perfil demo no Cofre.",
  "Não foi possível abrir o cofre de demonstração com este PIN. Redefina o perfil demo no Cofre se necessário.",
);

fs.writeFileSync(p, s);
const left = [...s.matchAll(/setPin\(|\bpin\b/g)].map((m) => m[0]);
console.log("done");
console.log("setPin count", (s.match(/setPin\(/g) || []).length);
console.log("clearSessionState count", (s.match(/clearSessionState/g) || []).length);
