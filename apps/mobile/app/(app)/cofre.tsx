import { useState } from "react";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Label,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { useVault } from "../../src/vault/VaultProvider";

export default function CofreScreen() {
  const vault = useVault();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Cofre</Title>
      <Subtitle>
        {`Perfil ${vault.activeProfile?.name ?? "—"}. Exporte ou importe o .gfin com o mesmo PIN.`}
      </Subtitle>
      <Card>
        <Button
          title={busy ? "…" : "Exportar .gfin"}
          disabled={busy}
          onPress={() =>
            run(() => vault.exportVault(), "Arquivo pronto para compartilhar.")
          }
        />
        <Button
          title="Bloquear agora"
          variant="ghost"
          onPress={() => vault.lock()}
        />
      </Card>
      <Card>
        <Label>PIN atual</Label>
        <Field
          value={currentPin}
          onChangeText={setCurrentPin}
          secureTextEntry
          keyboardType="number-pad"
        />
        <Label>Novo PIN</Label>
        <Field
          value={newPin}
          onChangeText={setNewPin}
          secureTextEntry
          keyboardType="number-pad"
        />
        <Button
          title="Trocar PIN"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            run(
              () => vault.changePin(currentPin, newPin),
              "PIN atualizado neste aparelho.",
            )
          }
        />
        <ErrorText>{err}</ErrorText>
        {msg ? <Subtitle>{msg}</Subtitle> : null}
      </Card>
    </Screen>
  );
}
