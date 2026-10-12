"use client";

import { useMemo, useState } from "react";
import { monthLabel } from "@/domain";
import { useAI } from "@/ai/ui/AIProvider";
import {
  AIAnalysisCard,
  AIInsightCard,
  SimulationNotice,
} from "@/ai/ui/AIInsight";
import { AIRuntimeAnalysisView } from "@/ai/ui/AIRuntimeAnalysisView";
import { AIStatusBadge } from "@/ai/ui/AIStatus";
import { PageHeader, Money } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BudgetObjective } from "@/ai/finance";
import { formatBrl } from "@/domain";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function AnalistaPage() {
  const {
    financialSnapshot,
    insights,
    alerts,
    patterns,
    overviewText,
    scenarios,
    modelStatus,
    year,
    month,
    setPeriod,
    generateOverviewWithAI,
    runBudget,
    portfolioAnalysis,
    runtimeAnalysis,
  } = useAI();

  const [budgetObjective, setBudgetObjective] =
    useState<BudgetObjective>("increase_contribution");
  const [overviewBusy, setOverviewBusy] = useState(false);
  const budget = useMemo(
    () => runBudget(budgetObjective),
    [runBudget, budgetObjective],
  );

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  if (!financialSnapshot) {
    return (
      <div>
        <PageHeader
          title="Analista"
          description="Desbloqueie o cofre para analisar suas finanças localmente."
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PageHeader
        title="Analista financeiro"
        description="Leitura do período com base nos seus dados — orientação, não previsão fechada."
        action={<AIStatusBadge status={modelStatus} />}
      />

      <aside
        role="note"
        className="surface-panel mb-4 border-insight/30 px-4 py-3"
      >
        <p className="type-label mb-1 text-insight">Leitura orientativa</p>
        <p className="text-sm font-medium leading-snug text-foreground">
          Insights, orçamento e simulações usam seus números atuais como
          premissa. São estimativas para apoiar decisão —{" "}
          <span className="text-expense">não são resultado garantido</span> nem
          aconselhamento financeiro.
        </p>
      </aside>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="surface-panel px-4 py-3">
          <p className="type-label">Renda</p>
          <p className="type-metric mt-1 text-xl text-income">
            <Money value={financialSnapshot.income.current} tone="income" />
          </p>
        </div>
        <div className="surface-panel px-4 py-3">
          <p className="type-label">Gastos</p>
          <p className="type-metric mt-1 text-xl text-expense">
            <Money value={financialSnapshot.expenses.current} tone="expense" />
          </p>
        </div>
        <div className="surface-panel px-4 py-3">
          <p className="type-label">Patrimônio</p>
          <p className="type-metric mt-1 text-xl text-investment">
            <Money
              value={financialSnapshot.netWorth.current}
              tone="investment"
            />
          </p>
        </div>
      </div>

      {modelStatus.error || modelStatus.status === "error" ? (
        <div
          className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Assistente local indisponível
          </p>
          <p className="mt-1 text-destructive/95 whitespace-pre-wrap">
            {modelStatus.error ||
              modelStatus.message ||
              "Inicie o runtime (npm run ai:runtime) e o Ollama. O panorama calculado continua abaixo."}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Mês</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => v && setPeriod(year, Number(v))}
          >
            <SelectTrigger className="h-8 w-36 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ano</Label>
          <Select
            value={String(year)}
            onValueChange={(v) => v && setPeriod(Number(v), month)}
          >
            <SelectTrigger className="h-8 w-28 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="self-end text-sm text-muted-foreground capitalize">
          {monthLabel(year, month)}
        </p>
      </div>

      <AIAnalysisCard
        title="Panorama"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={overviewBusy || modelStatus.status === "disabled"}
            onClick={() => {
              setOverviewBusy(true);
              void generateOverviewWithAI().finally(() =>
                setOverviewBusy(false),
              );
            }}
          >
            {overviewBusy ? "Gerando…" : "Narrar com IA local"}
          </Button>
        }
      >
        {runtimeAnalysis ? (
          <AIRuntimeAnalysisView analysis={runtimeAnalysis} />
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {overviewText}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Resumo calculado a partir do cofre · “Narrar com IA” só interpreta —
              não altera nem garante o futuro.
            </p>
          </>
        )}
      </AIAnalysisCard>

      <AIAnalysisCard title="O que chamou atenção" eyebrow="Com base no período">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há insights com evidência para este período.
          </p>
        ) : (
          <div className="space-y-4">
            {insights.map((item) => (
              <AIInsightCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </AIAnalysisCard>

      <AIAnalysisCard title="Fique de olho" eyebrow="Alertas do sistema">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum alerta no momento com os thresholds atuais.
          </p>
        ) : (
          <div className="space-y-4">
            {alerts.map((item) => (
              <AIInsightCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </AIAnalysisCard>

      <AIAnalysisCard title="Padrões" eyebrow="Detecção local">
        <div className="space-y-4">
          {patterns.map((item) => (
            <AIInsightCard key={item.id} item={item} />
          ))}
        </div>
      </AIAnalysisCard>

      <AIAnalysisCard title="Seu orçamento" eyebrow="Sugestões · não são regras">
        <SimulationNotice compact>
          Hipóteses de alocação com base no objetivo escolhido. Ajuste conforme
          sua realidade — o app não executa essas mudanças sozinho.
        </SimulationNotice>
        <div className="mb-3 mt-4 flex flex-wrap gap-2">
          {(
            [
              ["increase_contribution", "Aumentar aportes"],
              ["pay_debts", "Reduzir dívidas"],
              ["reach_goal", "Atingir meta"],
              ["increase_reserve", "Aumentar reserva"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={budgetObjective === id ? "default" : "outline"}
              onClick={() => setBudgetObjective(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {budget ? (
          <>
            <p className="text-sm text-muted-foreground">{budget.summary}</p>
            <ul className="mt-4 space-y-3">
              {budget.opportunities.map((o) => (
                <li key={o.id} className="border-l-2 border-l-primary/30 pl-3">
                  <p className="text-sm font-medium">{o.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {o.summary}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </AIAnalysisCard>

      <AIAnalysisCard title="Sua carteira" eyebrow="Retrato atual">
        {portfolioAnalysis ? (
          <>
            <p className="text-sm">{portfolioAnalysis.summary}</p>
            {portfolioAnalysis.allocation.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {portfolioAnalysis.allocation.map((a) => (
                  <li
                    key={a.class}
                    className="flex justify-between gap-2 tabular-nums"
                  >
                    <span>{a.class}</span>
                    <span className="text-muted-foreground">
                      {(a.percentage * 100).toFixed(0)}% · {formatBrl(a.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {portfolioAnalysis.concentrationNote ? (
                <p>{portfolioAnalysis.concentrationNote}</p>
              ) : null}
              {portfolioAnalysis.goalsNote ? (
                <p>{portfolioAnalysis.goalsNote}</p>
              ) : null}
              {portfolioAnalysis.debtsNote ? (
                <p>{portfolioAnalysis.debtsNote}</p>
              ) : null}
              {portfolioAnalysis.liquidityNote ? (
                <p>{portfolioAnalysis.liquidityNote}</p>
              ) : null}
            </div>
            {portfolioAnalysis.pointsToEvaluate.length > 0 ? (
              <ul className="mt-3 list-inside list-disc text-sm">
                {portfolioAnalysis.pointsToEvaluate.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </AIAnalysisCard>

      <AIAnalysisCard
        title="Simule uma decisão"
        eyebrow="Cenários hipotéticos"
      >
        <SimulationNotice>
          Os números abaixo projetam “e se…” com premissas explícitas. Mudança de
          renda, gastos ou mercado altera o resultado — trate como exercício, não
          como destino.
        </SimulationNotice>
        <div className="mt-4 space-y-4">
          {scenarios.map((s) => (
            <article key={s.id} className="surface-panel space-y-3 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-heading text-base font-bold tracking-tight">
                  {s.title}
                </h3>
                <span className="rounded-md border border-expense/30 bg-expense/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-expense">
                  Simulação
                </span>
              </div>
              <SimulationNotice compact>{s.disclaimer}</SimulationNotice>
              <div>
                <p className="type-label mb-2">Premissas</p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {s.premises.map((p) => (
                    <div
                      key={p.label}
                      className="surface-inset px-3 py-2"
                    >
                      <dt className="text-[11px] text-muted-foreground">
                        {p.label}
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">
                        {p.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="type-label mb-2">Resultado estimado</p>
                <ul className="space-y-2">
                  {s.results.map((r) => (
                    <li
                      key={r.label}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-semibold tabular-nums">{r.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </AIAnalysisCard>
    </div>
  );
}
