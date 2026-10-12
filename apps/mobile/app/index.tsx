import {
  MARINA_DEMO_CREDENTIALS,
  MARINA_DEMO_PIN,
  MARINA_DEMO_PROFILE_ID,
} from "@gf/core";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { CryptoProgress } from "../src/adapters/crypto";
import { isNativeCryptoAvailable } from "../src/adapters/crypto";
import { UnlockOverlay } from "../src/components/UnlockOverlay";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Label,
  Loading,
  Screen,
  Subtitle,
  Title,
} from "../src/components/ui";
import { colors, fonts } from "../src/theme";
import { useVault } from "../src/vault/VaultProvider";

const showDemoPin = typeof __DEV__ !== "undefined" ? __DEV__ : true;

export default function AuthGate() {
  const vault = useVault();
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [cryptoStage, setCryptoStage] = useState<CryptoProgress>("idle");
  const [localError, setLocalError] = useState<string | null>(null);

  if (vault.status === "loading") return <Loading />;
  if (vault.status === "unlocked") return <Redirect href="/(app)" />;

  const err = localError ?? vault.error;
  const isMarinaSelected =
    vault.selectedProfile?.id === MARINA_DEMO_PROFILE_ID ||
    vault.selectedProfile?.kind === "demo";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setLocalError(null);
    vault.clearError();
    try {
      await fn();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    const digits = pin.replace(/\D/g, "");
    if (digits.length < 4) {
      setLocalError("Informe o PIN (mín. 4 dígitos).");
      return;
    }
    setBusy(true);
    setUnlocking(true);
    setCryptoStage("preparing");
    setLocalError(null);
    vault.clearError();
    try {
      // Deixa o overlay pintar antes do KDF
      await new Promise((r) => setTimeout(r, 48));
      await vault.unlock(digits, setCryptoStage);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Erro ao abrir o cofre");
    } finally {
      setBusy(false);
      setUnlocking(false);
      setCryptoStage("idle");
    }
  }

  if (vault.status === "pin_required" && vault.selectedProfile) {
    return (
      <View style={styles.unlockRoot}>
        <LinearGradient
          colors={["#0f2924", "#1a5c4a", "#f4faf7"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Screen scroll={false}>
          <View style={styles.unlockInner}>
            <Text style={styles.unlockBrand}>Gestão Financeira</Text>
            <Text style={styles.unlockHello}>
              {`Olá, ${vault.selectedProfile.name}`}
            </Text>
            <Text style={styles.unlockHint}>
              PIN do cofre neste aparelho — dados cifrados com AES-GCM.
            </Text>

            {showDemoPin && isMarinaSelected ? (
              <Pressable
                style={styles.demoChip}
                onPress={() => setPin(MARINA_DEMO_PIN)}
              >
                <Text style={styles.demoChipText}>
                  {`Teste · PIN ${MARINA_DEMO_PIN}`}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.pinCard}>
              <Text style={styles.pinLabel}>PIN</Text>
              <TextInput
                value={pin}
                onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 8))}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                placeholder="••••••"
                placeholderTextColor={colors.muted}
                style={styles.pinInput}
                editable={!busy}
                autoFocus
              />
              <View style={styles.dots}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i < pin.length ? styles.dotOn : null,
                    ]}
                  />
                ))}
              </View>
              <ErrorText>{err}</ErrorText>
              <Button
                title={busy ? "Abrindo cofre…" : "Desbloquear"}
                disabled={busy || pin.length < 4}
                onPress={() => void handleUnlock()}
              />
              <Button
                title="Trocar usuário"
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  setPin("");
                  vault.clearSelectedProfile();
                }}
              />
              {!isNativeCryptoAvailable() ? (
                <Text style={styles.nativeNote}>
                  Build nativo recomendado para PBKDF2 rápido (Expo Go usa
                  fallback JS).
                </Text>
              ) : null}
            </View>
          </View>
        </Screen>
        <UnlockOverlay
          visible={unlocking}
          stage={cryptoStage}
          profileName={vault.selectedProfile.name}
        />
      </View>
    );
  }

  if (vault.status === "user_selection") {
    return (
      <Screen>
        <Title>Gestão Financeira</Title>
        <Subtitle>
          Escolha um perfil ou crie outro. Os dados ficam só neste celular.
        </Subtitle>
        {showDemoPin ? (
          <Card>
            <Subtitle>
              {`Teste pronto: ${MARINA_DEMO_CREDENTIALS.name} · login ${MARINA_DEMO_CREDENTIALS.username} · PIN ${MARINA_DEMO_PIN}`}
            </Subtitle>
          </Card>
        ) : null}
        <Card>
          {vault.profiles.map((p) => (
            <Button
              key={p.id}
              title={
                p.id === MARINA_DEMO_PROFILE_ID || p.kind === "demo"
                  ? `${p.name} (teste)`
                  : p.name
              }
              variant="ghost"
              onPress={() => run(() => vault.selectProfile(p.id))}
            />
          ))}
        </Card>
        <CreateForm
          name={name}
          login={login}
          pin={pin}
          setName={setName}
          setLogin={setLogin}
          setPin={setPin}
          busy={busy}
          err={err}
          onCreate={(mode) =>
            run(() => vault.createProfile({ name, login, pin, mode }))
          }
          onImport={() =>
            run(() => vault.importVaultAsNewUser({ name, login, pin }))
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Gestão Financeira</Title>
      <Subtitle>
        Seu cofre financeiro neste aparelho. Dados criptografados localmente.
      </Subtitle>
      <CreateForm
        name={name}
        login={login}
        pin={pin}
        setName={setName}
        setLogin={setLogin}
        setPin={setPin}
        busy={busy}
        err={err}
        onCreate={(mode) =>
          run(() => vault.createProfile({ name, login, pin, mode }))
        }
        onImport={() =>
          run(() => vault.importVaultAsNewUser({ name, login, pin }))
        }
      />
    </Screen>
  );
}

function CreateForm(props: {
  name: string;
  login: string;
  pin: string;
  setName: (v: string) => void;
  setLogin: (v: string) => void;
  setPin: (v: string) => void;
  busy: boolean;
  err: string | null;
  onCreate: (mode: "empty" | "demo") => void;
  onImport: () => void;
}) {
  return (
    <Card>
      <Label>Nome</Label>
      <Field value={props.name} onChangeText={props.setName} placeholder="Seu nome" />
      <Label>Login</Label>
      <Field
        value={props.login}
        onChangeText={props.setLogin}
        autoCapitalize="none"
        placeholder="seu.login"
      />
      <Label>PIN</Label>
      <Field
        value={props.pin}
        onChangeText={props.setPin}
        secureTextEntry
        keyboardType="number-pad"
        placeholder="mín. 4 dígitos"
      />
      <ErrorText>{props.err}</ErrorText>
      <Button
        title={props.busy ? "Aguarde…" : "Criar cofre vazio"}
        disabled={props.busy}
        onPress={() => props.onCreate("empty")}
      />
      <View style={{ height: 4 }} />
      <Subtitle>
        Já tem um arquivo .gfin? Use o mesmo PIN e importe abaixo.
      </Subtitle>
      <Button
        title="Importar arquivo .gfin"
        variant="ghost"
        disabled={props.busy}
        onPress={props.onImport}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  unlockRoot: { flex: 1, backgroundColor: colors.bg },
  unlockInner: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
    paddingBottom: 40,
  },
  unlockBrand: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: "#ccebe0",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  unlockHello: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: "#f4faf7",
    letterSpacing: -0.5,
  },
  unlockHint: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(244,250,247,0.78)",
    marginBottom: 8,
  },
  demoChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(244,250,247,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  demoChipText: {
    color: "#f4faf7",
    fontFamily: fonts.sansBold,
    fontSize: 13,
  },
  pinCard: {
    marginTop: 8,
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pinInput: {
    fontFamily: fonts.sansBold,
    fontSize: 28,
    letterSpacing: 8,
    color: colors.fg,
    paddingVertical: 8,
  },
  dots: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentSoft,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
  nativeNote: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    textAlign: "center",
  },
});
