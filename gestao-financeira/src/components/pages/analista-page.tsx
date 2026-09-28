"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { monthLabel } from "@/domain";
import { useAI } from "@/ai/ui/AIProvider";
import { AIAnalysisCard, AIInsightCard } from "@/ai/ui/AIInsight";
import { AIChat } from "@/ai/ui/AIChat";
import { AIModelSetup } from "@/ai/ui/AIModelSetup";
import { AIRuntimeAnalysisView } from "@/ai/ui/AIRuntimeAnalysisView";
import { AIStatusBadge } from "@/ai/ui/AIStatus";
import { PageHeader, Section, Money } from "@/components/ui-helpers";
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
        description="Seu panorama em poucas palavras — cálculos no sistema, interpretação local."
        action={<AIStatusBadge status={modelStatus} />}
      />

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
            <SelectTrigger className="h-9 w-36">
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
            <SelectTrigger className="h-9 w-28">
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
              Resumo calculado pelo sistema · use Narrar com IA local para
              interpretação no runtime (127.0.0.1)
            </p>
          </>
        )}
      </AIAnalysisCard>

      <AIAnalysisCard title="O que chamou atenção">
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

      <AIAnalysisCard title="Fique de olho">
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

      <AIAnalysisCard title="Padrões">
        <div className="space-y-4">
          {patterns.map((item) => (
            <AIInsightCard key={item.id} item={item} />
          ))}
        </div>
      </AIAnalysisCard>

      <AIAnalysisCard title="Seu orçamento">
        <div className="mb-3 flex flex-wrap gap-2">
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

      <AIAnalysisCard title="Sua carteira">
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

      <AIAnalysisCard title="Simule uma decisão">
        <div className="space-y-4">
          {scenarios.map((s) => (
            <div key={s.id} className="border-t border-border/30 pt-3 first:border-0 first:pt-0">
              <p className="text-sm font-medium">{s.title}</p>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {s.premises.map((p) => (
                  <div key={p.label}>
                    <dt className="text-xs text-muted-foreground">{p.label}</dt>
                    <dd>{p.value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-2 space-y-1 text-sm">
                {s.results.map((r) => (
                  <li key={r.label}>
                    <span className="text-muted-foreground">{r.label}: </span>
                    {r.value}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{s.disclaimer}</p>
            </div>
          ))}
        </div>
      </AIAnalysisCard>

      <Section className="border-t border-border/40 pt-6">
        <div className="mb-2 grid gap-2 sm:grid-cols-3">
          <div>
            <p className="type-label">Renda</p>
            <p className="type-metric text-xl text-income">
              <Money value={financialSnapshot.income.current} tone="income" />
            </p>
          </div>
          <div>
            <p className="type-label">Gastos</p>
            <p className="type-metric text-xl text-expense">
              <Money value={financialSnapshot.expenses.current} tone="expense" />
            </p>
          </div>
          <div>
            <p className="type-label">Patrimônio</p>
            <p className="type-metric text-xl text-investment">
              <Money
                value={financialSnapshot.netWorth.current}
                tone="investment"
              />
            </p>
          </div>
        </div>
      </Section>

      <AIAnalysisCard title="Pergunte">
        <AIChat />
      </AIAnalysisCard>

      <AIAnalysisCard title="Assistente local">
        <AIModelSetup />
        <p className="mt-3 text-sm text-muted-foreground">
          Detecção automática de recorrências continua em{" "}
          <Link href="/inteligencia" className="text-primary underline-offset-2 hover:underline">
            Inteligência
          </Link>
          .
        </p>
      </AIAnalysisCard>
    </div>
  );
}
