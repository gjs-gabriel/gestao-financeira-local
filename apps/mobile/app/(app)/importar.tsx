import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import Papa from "papaparse";
import { createLocalId } from "../../src/adapters/profiles";
import {
  Button,
  Card,
  ErrorText,
  ListRow,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { useVault } from "../../src/vault/VaultProvider";

type PreviewRow = { date: string; name: string; amount: number };

function parseAmount(raw: string): number {
  const cleaned = raw
    .replace(/R\$\s?/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseCsv(text: string): PreviewRow[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: PreviewRow[] = [];
  for (const row of parsed.data) {
    const keys = Object.keys(row);
    const dateKey =
      keys.find((k) => /data|date/i.test(k)) ?? keys[0] ?? "date";
    const nameKey =
      keys.find((k) => /desc|histórico|historico|memo|name/i.test(k)) ??
      keys[1] ??
      "name";
    const amountKey =
      keys.find((k) => /valor|amount|vlr/i.test(k)) ?? keys[2] ?? "amount";
    const amount = parseAmount(String(row[amountKey] ?? ""));
    if (!Number.isFinite(amount) || amount === 0) continue;
    rows.push({
      date: String(row[dateKey] ?? "").slice(0, 10),
      name: String(row[nameKey] ?? "Lançamento").slice(0, 120),
      amount,
    });
  }
  return rows.slice(0, 200);
}

export default function ImportarScreen() {
  const { updateSnapshot } = useVault();
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function pickCsv() {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) {
        throw new Error("Nenhum arquivo selecionado.");
      }
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const rows = parseCsv(text);
      if (rows.length === 0) {
        throw new Error("Não encontrei lançamentos no CSV.");
      }
      setPreview(rows);
      setInfo(`${rows.length} linhas prontas (máx. 200).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha na leitura");
      setPreview([]);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setErr(null);
    try {
      const now = new Date().toISOString();
      await updateSnapshot((s) => {
        const expenses = [...s.oneTimeExpenses];
        const incomes = [...s.oneTimeIncomes];
        for (const row of preview) {
          const date =
            /^\d{4}-\d{2}-\d{2}/.test(row.date) ?
              row.date.slice(0, 10)
            : now.slice(0, 10);
          if (row.amount < 0) {
            expenses.push({
              id: createLocalId("imp"),
              name: row.name,
              amount: Math.abs(row.amount),
              date,
              createdAt: now,
              updatedAt: now,
            });
          } else {
            incomes.push({
              id: createLocalId("imp"),
              name: row.name,
              amount: row.amount,
              date,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        return {
          ...s,
          oneTimeExpenses: expenses,
          oneTimeIncomes: incomes,
          updatedAt: now,
        };
      });
      setInfo("Importação aplicada ao cofre local.");
      setPreview([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao gravar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Importar</Title>
      <Subtitle>
        Importe extratos CSV neste aparelho.
      </Subtitle>
      <Card>
        <Button
          title={busy ? "…" : "Escolher CSV"}
          disabled={busy}
          onPress={() => void pickCsv()}
        />
        <Button
          title="Aplicar no cofre"
          variant="ghost"
          disabled={busy || preview.length === 0}
          onPress={() => void commit()}
        />
        <ErrorText>{err}</ErrorText>
        {info ? <Subtitle>{info}</Subtitle> : null}
      </Card>
      <Card>
        {preview.slice(0, 30).map((r, i) => (
          <ListRow
            key={`${r.date}-${i}`}
            title={r.name}
            subtitle={r.date}
            right={r.amount.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          />
        ))}
        {preview.length === 0 ? (
          <Subtitle>Nenhuma prévia ainda.</Subtitle>
        ) : null}
      </Card>
    </Screen>
  );
}
