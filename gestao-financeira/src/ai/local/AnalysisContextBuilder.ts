/**
 * Constrói FinancialContext minimizado a partir do snapshot já calculado.
 * Nunca inclui PIN, chaves, IDs de vault ou lançamentos brutos.
 */

import type { FinancialSnapshot } from "../finance/types";
import type { FinancialContext } from "./types";

const FORBIDDEN_KEY =
  /(^|_)(pin|password|senha|aes|cryptoKey|vaultKey|vaultId|privateKey|authorization|bearer|credential)$/i;

export function assertNoSecretsInContext(ctx: FinancialContext): void {
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(k) || /^pin$/i.test(k) || /pin$/i.test(k)) {
        throw new Error(
          `AnalysisContextBuilder: contexto contém campos proibidos (${k}).`,
        );
      }
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(ctx);
}

export function buildFinancialContextFromSnapshot(
  snapshot: FinancialSnapshot,
  intent: string,
  extras?: {
    question?: string;
    trends?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  },
): FinancialContext {
  const ym = snapshot.period.currentMonth;
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${ym}-${String(lastDay).padStart(2, "0")}`;

  const ctx: FinancialContext = {
    version: 1,
    intent,
    period: { start, end },
    summary: {
      income: snapshot.income.current,
      expenses: snapshot.expenses.current,
      cashFlow: snapshot.cashFlow.surplus,
      netWorth: snapshot.netWorth.current,
      savingsRate: snapshot.cashFlow.savingsRate,
      commitmentRatio: snapshot.cashFlow.commitmentRatio,
    },
    expensesByCategory: snapshot.expenses.byCategory
      .slice(0, 12)
      .map((c) => ({
        category: c.category,
        amount: c.amount,
        percentage: c.percentage,
        variation: c.variation,
      })),
    investments: snapshot.investments.allocation.slice(0, 10).map((a) => ({
      class: a.class,
      amount: a.amount,
      percentage: a.percentage,
    })),
    debts: snapshot.debts.items.slice(0, 8).map((d) => ({
      name: d.name,
      balance: d.balance,
      installmentAmount: d.installmentAmount,
    })),
    goals: snapshot.goals.slice(0, 8).map((g) => ({
      name: g.name,
      current: g.current,
      target: g.target,
      progress: g.progress,
      remaining: g.remaining,
    })),
    trends: extras?.trends ?? {
      historyMonths: snapshot.history.months.slice(-6),
      netWorthVariation12m: snapshot.netWorth.variation12m,
      incomeVariation: snapshot.income.variation,
      expenseVariation: snapshot.expenses.variation,
    },
    extras: extras?.extras,
    question: extras?.question,
  };

  assertNoSecretsInContext(ctx);
  return ctx;
}

/** Contexto fictício para diagnóstico — sem dados reais do usuário. */
export function buildFinancialTestContext(): FinancialContext {
  return {
    version: 1,
    intent: "overview",
    period: { start: "2026-01-01", end: "2026-01-31" },
    summary: {
      income: 5000,
      expenses: 3200,
      cashFlow: 1800,
      netWorth: 42000,
      savingsRate: 0.36,
    },
    expensesByCategory: [
      { category: "Moradia", amount: 1500, percentage: 46.9 },
      { category: "Alimentação", amount: 800, percentage: 25 },
      { category: "Transporte", amount: 400, percentage: 12.5 },
    ],
    investments: [
      { class: "renda_fixa", amount: 25000, percentage: 59.5 },
      { class: "acoes", amount: 10000, percentage: 23.8 },
    ],
    debts: [],
    goals: [
      {
        name: "Reserva",
        current: 8000,
        target: 15000,
        progress: 0.53,
        remaining: 7000,
      },
    ],
    trends: {},
  };
}
