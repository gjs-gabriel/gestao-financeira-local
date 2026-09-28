"use client";

import { useMemo, useState } from "react";
import {
  analyzePortfolio,
  buildIntelligenceReport,
  createId,
  detectAnomalies,
  detectRecurringCandidates,
  forecastDetailed,
  formatBrl,
  FREQUENCY_LABELS,
  INVESTMENT_CLASS_LABELS,
  upsertRecurringExpenseSynced,
  type InvestmentClass,
  type RecurrenceCandidate,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { EmptyState, Money, PageHeader } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function classLabel(name: string) {
  return (
    INVESTMENT_CLASS_LABELS[name as InvestmentClass] ?? name
  );
}

function ConfidenceBadge({
  value,
}: {
  value: "alta" | "media" | "baixa";
}) {
  const tone =
    value === "alta"
      ? "text-emerald-800"
      : value === "media"
        ? "text-amber-800"
        : "text-muted-foreground";
  return (
    <span className={`text-xs uppercase tracking-wide ${tone}`}>
      {value === "alta" ? "Alta" : value === "media" ? "Média" : "Baixa"} confiança
    </span>
  );
}

export function InteligenciaPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  if (!snapshot) return null;

  const report = buildIntelligenceReport(snapshot, now);
  const recurrencies = detectRecurringCandidates(snapshot);
  const anomalies = detectAnomalies(snapshot, now);
  const forecast = forecastDetailed(snapshot, 6, now);
  const portfolio = analyzePortfolio(snapshot);

  async function acceptRecurrence(candidate: RecurrenceCandidate) {
    setBusyKey(candidate.key);
    try {
      const ts = new Date().toISOString();
      await updateSnapshot((s) =>
        upsertRecurringExpenseSynced(s, {
          id: createId("rex"),
          name: candidate.name,
          amount: candidate.amount,
          frequency: candidate.suggestedFrequency,
          categoryId: candidate.categoryId,
          notes: `Sugerido pela inteligência (${candidate.occurrences} ocorrências)`,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Inteligência"
        description="Sugestões locais a partir do seu histórico. Nada é alterado sem você confirmar."
      />

      <Tabs defaultValue="recorrencias">
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          <TabsTrigger value="recorrencias">Recorrências</TabsTrigger>
          <TabsTrigger value="anomalias">Anomalias</TabsTrigger>
          <TabsTrigger value="previsao">Previsão</TabsTrigger>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
        </TabsList>

        <TabsContent value="recorrencias" className="space-y-3">
          {recurrencies.length === 0 ? (
            <EmptyState
              title="Nenhuma recorrência sugerida"
              description="Com mais lançamentos pontuais semelhantes em meses diferentes, aparecem candidatos aqui."
            />
          ) : (
            recurrencies.map((c) => (
              <div
                key={c.key}
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <ConfidenceBadge value={c.confidence} />
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    ~{formatBrl(c.amount)} ·{" "}
                    {FREQUENCY_LABELS[c.suggestedFrequency]} · {c.occurrences}{" "}
                    meses
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={busyKey === c.key}
                  onClick={() => void acceptRecurrence(c)}
                >
                  {busyKey === c.key ? "Salvando…" : "Cadastrar como recorrente"}
                </Button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="anomalias" className="space-y-3">
          {anomalies.length === 0 ? (
            <EmptyState
              title="Nada fora do padrão"
              description="Comparações com a média recente não apontaram alterações relevantes neste mês."
            />
          ) : (
            anomalies.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border bg-card/40 px-4 py-3 ${
                  a.severity === "warning"
                    ? "border-amber-300"
                    : "border-border/60"
                }`}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {a.severity === "warning" ? "Atenção" : "Info"}
                </p>
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-muted-foreground">{a.message}</p>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="previsao">
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Mês</th>
                  <th className="px-3 py-2 font-medium">Entradas</th>
                  <th className="px-3 py-2 font-medium">Saídas</th>
                  <th className="px-3 py-2 font-medium">Estimativa*</th>
                  <th className="px-3 py-2 font-medium">Sobra</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => (
                  <tr key={row.key} className="border-b border-border/40">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatBrl(row.totalIncome)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatBrl(row.totalExpense - row.estimatedExpense)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.estimatedExpense > 0
                        ? formatBrl(row.estimatedExpense)
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Money value={row.surplus} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.projected ? "previsto" : "realizado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            *Estimativa parcial de candidatos de recorrência ainda não
            cadastrados — só sugestão, não altera o cofre.
          </p>
        </TabsContent>

        <TabsContent value="carteira" className="space-y-6">
          {portfolio.total <= 0 ? (
            <EmptyState
              title="Sem aplicações"
              description="Cadastre posições em Aplicações para ver concentração e fluxo de aportes."
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Total investido"
                  value={formatBrl(portfolio.total)}
                />
                <Stat
                  label="Aportes (12m)"
                  value={formatBrl(portfolio.contributionsLast12m)}
                />
                <Stat
                  label="Resgates (12m)"
                  value={formatBrl(portfolio.redemptionsLast12m)}
                />
              </div>
              {portfolio.concentration ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-950">
                  Concentração: {portfolio.concentration.name} representa{" "}
                  {portfolio.concentration.pct}% da carteira.
                </p>
              ) : null}
              <div className="grid gap-6 lg:grid-cols-2">
                <Breakdown
                  title="Por classe"
                  rows={portfolio.byClass.map((r) => ({
                    ...r,
                    name: classLabel(r.name),
                  }))}
                />
                <Breakdown title="Por instituição" rows={portfolio.byInstitution} />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-xs text-muted-foreground">
        Relatório gerado localmente · {report.recurrencies.length} recorrência(s),{" "}
        {report.anomalies.length} anomalia(s).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; amount: number; pct: number }[];
}) {
  return (
    <div>
      <h3 className="mb-2 font-heading text-sm font-medium">{title}</h3>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex justify-between gap-3">
            <span>
              {r.name}{" "}
              <span className="text-muted-foreground">({r.pct}%)</span>
            </span>
            <span className="tabular-nums">{formatBrl(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
