import { compareDebtPlans, debtAmortizationSeries, formatBrl } from "@gf/core";
import { useMemo, useState } from "react";
import { createLocalId } from "../../src/adapters/profiles";
import { MoneyLineChart } from "../../src/components/MoneyCharts";
import {
  Button,
  Card,
  Field,
  Label,
  ListRow,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { brl } from "../../src/lib/money";
import { colors } from "../../src/theme";
import { useVault } from "../../src/vault/VaultProvider";

export default function DividasScreen() {
  const { snapshot, updateSnapshot } = useVault();
  const [simId, setSimId] = useState<string | null>(null);
  const [extra, setExtra] = useState("100");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simDebt = snapshot?.debts.find((d) => d.id === simId) ?? null;
  const comparison = useMemo(() => {
    if (!simDebt) return null;
    const n = Number(String(extra).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return compareDebtPlans(simDebt, n);
  }, [simDebt, extra]);

  const amort = comparison
    ? debtAmortizationSeries(
        comparison.base.schedule,
        comparison.withExtra.schedule,
        60,
      )
    : [];

  if (!snapshot) return null;
  const now = new Date().toISOString();

  return (
    <Screen>
      <Title>Dívidas</Title>
      <Subtitle>Saldos e simulação de pagamento extra.</Subtitle>
      <Card>
        {snapshot.debts.length === 0 ? (
          <Subtitle>Nenhuma dívida cadastrada.</Subtitle>
        ) : (
          snapshot.debts.map((d) => (
            <ViewRow
              key={d.id}
              title={d.name}
              subtitle={d.dueDate ?? "sem vencimento"}
              right={brl(d.balance)}
              onSim={() => {
                setSimId(d.id);
                setExtra("100");
              }}
            />
          ))
        )}
      </Card>

      {simDebt && comparison ? (
        <Card>
          <Subtitle>{`Simulação · ${simDebt.name}`}</Subtitle>
          <Label>Extra mensal (R$)</Label>
          <Field
            value={extra}
            onChangeText={setExtra}
            keyboardType="decimal-pad"
          />
          <ListRow
            title="Sem extra"
            subtitle={`${comparison.base.months} meses`}
            right={formatBrl(comparison.base.totalInterest)}
          />
          <ListRow
            title="Com extra"
            subtitle={`${comparison.withExtra.months} meses`}
            right={formatBrl(comparison.withExtra.totalInterest)}
          />
          <ListRow
            title="Economia"
            subtitle={`${comparison.monthsSaved} mês(es)`}
            right={formatBrl(comparison.interestSaved)}
          />
          <MoneyLineChart
            title="Amortização do saldo"
            series={[
              {
                name: "Sem extra",
                color: colors.expense,
                data: amort
                  .filter((p) => p.semExtra != null)
                  .map((p) => ({
                    label: String(p.month),
                    value: p.semExtra ?? 0,
                  })),
              },
              {
                name: "Com extra",
                color: colors.chartBrand,
                data: amort
                  .filter((p) => p.comExtra != null)
                  .map((p) => ({
                    label: String(p.month),
                    value: p.comExtra ?? 0,
                  })),
              },
            ]}
          />
          <Button title="Fechar simulação" variant="ghost" onPress={() => setSimId(null)} />
        </Card>
      ) : null}

      <Card>
        <Label>Nova dívida</Label>
        <Field value={title} onChangeText={setTitle} placeholder="Descrição" />
        <Field
          value={amount}
          onChangeText={setAmount}
          placeholder="Saldo"
          keyboardType="decimal-pad"
        />
        {error ? <Subtitle>{error}</Subtitle> : null}
        <Button
          title={busy ? "Salvando…" : "Adicionar"}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              if (!title.trim()) throw new Error("Informe a descrição.");
              const n = Number(String(amount).replace(",", "."));
              if (!Number.isFinite(n) || n <= 0) {
                throw new Error("Informe um valor válido.");
              }
              await updateSnapshot((s) => ({
                ...s,
                debts: [
                  ...s.debts,
                  {
                    id: createLocalId("debt"),
                    name: title.trim(),
                    balance: n,
                    createdAt: now,
                    updatedAt: now,
                  },
                ],
                updatedAt: now,
              }));
              setTitle("");
              setAmount("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Erro");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </Screen>
  );
}

function ViewRow({
  title,
  subtitle,
  right,
  onSim,
}: {
  title: string;
  subtitle: string;
  right: string;
  onSim: () => void;
}) {
  return (
    <>
      <ListRow title={title} subtitle={subtitle} right={right} />
      <Button title="Simular pagamento extra" variant="ghost" onPress={onSim} />
    </>
  );
}
