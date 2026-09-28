/**
 * Insights do painel — sempre derivados dos dados reais.
 * Linguagem objetiva, sem aconselhamento.
 */

import { expensesByCategoryForMonth, goalProgress } from "./calculations";
import { cashflowLastMonths } from "./cashflow";
import { formatBrl } from "./labels";
import { wealthBreakdown, wealthHistorySeries } from "./wealth";
import { installmentLoadByMonth } from "./insights";
import type { VaultSnapshot } from "./types";

export type InsightTone = "neutral" | "income" | "expense" | "investment" | "alert";

export interface DashboardInsight {
  id: string;
  title: string;
  description: string;
  tone: InsightTone;
}

export function buildDashboardInsights(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
  today = new Date(),
): DashboardInsight[] {
  const out: DashboardInsight[] = [];
  const cats = expensesByCategoryForMonth(snapshot, year, month);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const top = cats[0];
  if (top && total > 0) {
    const pct = Math.round((top.amount / total) * 100);
    out.push({
      id: "top-cat",
      title: "Concentração de gastos",
      description: `${top.categoryName} representa ${pct}% dos seus gastos neste mês.`,
      tone: "expense",
    });
  }

  const series = cashflowLastMonths(snapshot, year, month, 3);
  if (series.length >= 2) {
    const last = series[series.length - 1]!;
    const prev = series[series.length - 2]!;
    const delta = last.surplus - prev.surplus;
    if (Math.abs(delta) >= 50) {
      out.push({
        id: "surplus-delta",
        title: delta >= 0 ? "Sobra em alta" : "Sobra em queda",
        description: `A sobra do mês mudou ${delta >= 0 ? "+" : ""}${formatBrl(delta)} em relação ao mês anterior.`,
        tone: delta >= 0 ? "income" : "alert",
      });
    }
  }

  const wealth = wealthHistorySeries(snapshot);
  if (wealth.length >= 2) {
    const a = wealth[wealth.length - 1]!;
    const b = wealth[Math.max(0, wealth.length - 4)]!;
    const delta = a.netWorth - b.netWorth;
    if (Math.abs(delta) >= 100) {
      out.push({
        id: "wealth-delta",
        title: delta >= 0 ? "Patrimônio em alta" : "Patrimônio em queda",
        description: `Seu patrimônio líquido mudou ${delta >= 0 ? "+" : ""}${formatBrl(delta)} no período recente.`,
        tone: delta >= 0 ? "investment" : "alert",
      });
    }
  }

  const installments = installmentLoadByMonth(snapshot, year, month, 1);
  const thisMonthInstallments = installments[0]?.amount ?? 0;
  if (thisMonthInstallments > 0) {
    out.push({
      id: "installments",
      title: "Parcelas no mês",
      description: `${formatBrl(thisMonthInstallments)} em parcelas já cadastradas neste mês.`,
      tone: "expense",
    });
  }

  for (const goal of snapshot.goals.slice(0, 3)) {
    const progress = goalProgress(goal);
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    if (progress >= 0.5 && progress < 1 && remaining > 0) {
      out.push({
        id: `goal-${goal.id}`,
        title: goal.name,
        description: `Faltam ${formatBrl(remaining)} para completar esta meta (${Math.round(progress * 100)}%).`,
        tone: "investment",
      });
      break;
    }
  }

  const w = wealthBreakdown(snapshot);
  if (w.investments > 0 && cashflowLastMonths(snapshot, year, month, 1)[0]) {
    const income = cashflowLastMonths(snapshot, year, month, 1)[0]!.income;
    if (income > 0) {
      // Aportes do mês via investment_buy
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      const aportes = (snapshot.transactions ?? [])
        .filter((t) => t.kind === "investment_buy" && t.date.startsWith(prefix))
        .reduce((s, t) => s + t.amount, 0);
      if (aportes > 0) {
        const pct = Math.round((aportes / income) * 100);
        out.push({
          id: "aporte-share",
          title: "Aportes do mês",
          description: `Seus aportes representam ${pct}% da renda deste mês (${formatBrl(aportes)}).`,
          tone: "investment",
        });
      }
    }
  }

  void today;
  return out.slice(0, 4);
}
