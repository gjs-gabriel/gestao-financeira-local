import {
  expensesByCategoryForMonth,
  goalProgress,
  monthlyCashflow,
} from "../domain/calculations";
import { cashflowLastMonths, monthKey } from "../domain/cashflow";
import {
  incomeCommitment,
  installmentLoadByMonth,
  percentChange,
  shiftMonth,
} from "../domain/insights";
import { INVESTMENT_CLASS_LABELS, formatBrl } from "../domain/labels";
import { smartGoalInsight } from "../domain/planning";
import { wealthBreakdown, wealthHistorySeries } from "../domain/wealth";
import type { VaultSnapshot } from "../domain/types";
import type { InvestmentClass } from "../domain/types";
import type {
  AllocationRow,
  CategoryExpenseRow,
  FinancialSnapshot,
  GoalRow,
} from "./types";

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Constrói agregados a partir do VaultSnapshot.
 * Não inclui txs individuais, IDs, instituições ou credenciais.
 */
export function buildFinancialSnapshot(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
  historicalMonths = 12,
): FinancialSnapshot {
  const current = monthlyCashflow(snapshot, year, month);
  const series = cashflowLastMonths(snapshot, year, month, historicalMonths);
  const incomes = series.map((s) => s.income);
  const expenses = series.map((s) => s.totalExpenses);
  const avgIncome = avg(incomes);
  const avgExpenses = avg(expenses);

  const prev = shiftMonth(year, month, -1);
  const prevCash = monthlyCashflow(snapshot, prev.year, prev.month);

  const cats = expensesByCategoryForMonth(snapshot, year, month);
  const expenseTotal = cats.reduce((s, c) => s + c.amount, 0) || current.totalExpenses;

  const byCategory: CategoryExpenseRow[] = cats.map((c) => {
    // variação vs média da categoria nos meses anteriores (quando possível)
    let variation: number | null = null;
    const histAmounts: number[] = [];
    for (let i = 1; i <= Math.min(6, historicalMonths); i++) {
      const p = shiftMonth(year, month, -i);
      const rows = expensesByCategoryForMonth(snapshot, p.year, p.month);
      const hit = rows.find((r) => r.categoryId === c.categoryId);
      if (hit) histAmounts.push(hit.amount);
    }
    if (histAmounts.length >= 2) {
      const base = avg(histAmounts);
      variation = percentChange(c.amount, base);
      if (variation !== null) variation = variation / 100;
    }
    return {
      category: c.categoryName,
      amount: c.amount,
      percentage: expenseTotal > 0 ? c.amount / expenseTotal : 0,
      variation,
    };
  });

  const commitment = incomeCommitment(current);
  const wealth = wealthBreakdown(snapshot);
  const wealthSeries = wealthHistorySeries(snapshot);
  let variation12m: number | null = null;
  if (wealthSeries.length >= 2) {
    const last = wealthSeries[wealthSeries.length - 1]!;
    const first =
      wealthSeries[Math.max(0, wealthSeries.length - 12)] ?? wealthSeries[0]!;
    variation12m = percentChange(last.netWorth, first.netWorth);
    if (variation12m !== null) variation12m = variation12m / 100;
  }

  const classMap = new Map<string, number>();
  for (const inv of snapshot.investments) {
    const label =
      INVESTMENT_CLASS_LABELS[inv.classification as InvestmentClass] ??
      inv.classification;
    classMap.set(label, (classMap.get(label) ?? 0) + inv.amount);
  }
  const invTotal = [...classMap.values()].reduce((a, b) => a + b, 0);
  const allocation: AllocationRow[] = [...classMap.entries()]
    .map(([cls, amount]) => ({
      class: cls,
      amount,
      percentage: invTotal > 0 ? amount / invTotal : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const topAlloc = allocation[0];

  const debtsTotal = snapshot.debts.reduce((s, d) => s + d.balance, 0);
  const monthlyPayments = snapshot.debts.reduce(
    (s, d) => s + (d.installmentAmount ?? 0),
    0,
  );

  const goals: GoalRow[] = snapshot.goals.map((g) => {
    const insight = smartGoalInsight(g);
    return {
      name: g.name,
      current: g.currentAmount,
      target: g.targetAmount,
      progress: goalProgress(g),
      remaining: insight.remaining,
      requiredMonthly: insight.requiredMonthly,
      deadlineMonths: insight.monthsLeft,
    };
  });

  const load30 = installmentLoadByMonth(snapshot, year, month, 1);
  const load90 = installmentLoadByMonth(snapshot, year, month, 3);
  const next30 =
    (load30[0]?.amount ?? 0) +
    monthlyPayments +
    current.recurringExpenses;
  const next90 =
    load90.reduce((s, m) => s + m.amount, 0) +
    monthlyPayments * 3 +
    current.recurringExpenses * 3;

  return {
    period: {
      currentMonth: monthKey(year, month),
      year,
      month,
      historicalMonths,
    },
    income: {
      current: current.income,
      monthlyAverage: Math.round(avgIncome * 100) / 100,
      variation: (() => {
        const v = percentChange(current.income, prevCash.income);
        return v === null ? null : v / 100;
      })(),
    },
    expenses: {
      current: current.totalExpenses,
      monthlyAverage: Math.round(avgExpenses * 100) / 100,
      variation: (() => {
        const v = percentChange(current.totalExpenses, prevCash.totalExpenses);
        return v === null ? null : v / 100;
      })(),
      byCategory,
    },
    cashFlow: {
      surplus: current.surplus,
      savingsRate:
        current.income > 0 ? current.surplus / current.income : null,
      commitmentRatio: commitment.ratio,
    },
    netWorth: {
      current: wealth.netWorth,
      assets: wealth.assets,
      liabilities: wealth.liabilities,
      variation12m,
      history: wealthSeries.slice(-12).map((p) => ({
        month: p.periodKey,
        value: p.netWorth,
      })),
    },
    investments: {
      total: invTotal,
      allocation,
      concentrationPct: topAlloc ? topAlloc.percentage * 100 : null,
      concentrationClass: topAlloc?.class ?? null,
    },
    debts: {
      total: debtsTotal,
      monthlyPayments,
      items: snapshot.debts.map((d) => ({
        name: d.name,
        balance: d.balance,
        installmentAmount: d.installmentAmount ?? null,
        interestRate: d.interestRate ?? null,
      })),
    },
    goals,
    commitments: {
      next30Days: Math.round(next30 * 100) / 100,
      next90Days: Math.round(next90 * 100) / 100,
    },
    history: {
      months: series.map((s) => ({
        month: s.key,
        income: s.income,
        expenses: s.totalExpenses,
        surplus: s.surplus,
      })),
    },
  };
}

/** Template de resumo sem LLM — só números do snapshot. */
export function buildDeterministicOverview(fs: FinancialSnapshot): string {
  const lines: string[] = [];
  lines.push(
    `No período ${fs.period.currentMonth}, a renda foi ${formatBrl(fs.income.current)} e os gastos ${formatBrl(fs.expenses.current)}.`,
  );
  lines.push(
    `Saldo do mês: ${formatBrl(fs.cashFlow.surplus)}${
      fs.cashFlow.savingsRate !== null
        ? ` (taxa de poupança ${(fs.cashFlow.savingsRate * 100).toFixed(1).replace(".", ",")}%).`
        : "."
    }`,
  );
  lines.push(
    `Patrimônio líquido: ${formatBrl(fs.netWorth.current)}.`,
  );
  if (fs.expenses.byCategory[0]) {
    const top = fs.expenses.byCategory[0];
    lines.push(
      `Maior categoria de gasto: ${top.category} (${formatBrl(top.amount)}, ${(top.percentage * 100).toFixed(0)}%).`,
    );
  }
  if (fs.goals[0]) {
    const g = fs.goals[0];
    lines.push(
      `Meta em destaque: ${g.name} — ${(g.progress * 100).toFixed(0)}% concluída.`,
    );
  }
  return lines.join("\n\n");
}
