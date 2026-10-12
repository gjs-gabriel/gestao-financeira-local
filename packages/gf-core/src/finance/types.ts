/**
 * FinancialSnapshot — agregados financeiros para análise.
 * Sem IDs de vault, PIN, instituições identificáveis ou txs brutas.
 */

export interface FinancialPeriod {
  currentMonth: string; // YYYY-MM
  year: number;
  month: number;
  historicalMonths: number;
}

export interface CategoryExpenseRow {
  category: string;
  amount: number;
  percentage: number;
  variation: number | null;
}

export interface GoalRow {
  name: string;
  current: number;
  target: number;
  progress: number;
  remaining: number;
  requiredMonthly: number | null;
  deadlineMonths: number | null;
}

export interface DebtRow {
  name: string;
  balance: number;
  installmentAmount: number | null;
  interestRate: number | null;
}

export interface AllocationRow {
  class: string;
  amount: number;
  percentage: number;
}

export interface FinancialSnapshot {
  period: FinancialPeriod;
  income: {
    current: number;
    monthlyAverage: number;
    variation: number | null;
  };
  expenses: {
    current: number;
    monthlyAverage: number;
    variation: number | null;
    byCategory: CategoryExpenseRow[];
  };
  cashFlow: {
    surplus: number;
    savingsRate: number | null;
    commitmentRatio: number | null;
  };
  netWorth: {
    current: number;
    assets: number;
    liabilities: number;
    variation12m: number | null;
    history: { month: string; value: number }[];
  };
  investments: {
    total: number;
    allocation: AllocationRow[];
    concentrationPct: number | null;
    concentrationClass: string | null;
  };
  debts: {
    total: number;
    monthlyPayments: number;
    items: DebtRow[];
  };
  goals: GoalRow[];
  commitments: {
    next30Days: number;
    next90Days: number;
  };
  history: {
    months: {
      month: string;
      income: number;
      expenses: number;
      surplus: number;
    }[];
  };
}

/** Contexto já sanitizado — única entrada permitida para o runtime de IA. */
export interface FinancialAIContext {
  version: 1;
  intent: AIContextIntent;
  facts: Record<string, unknown>;
  generatedAt: string;
}

export type AIContextIntent =
  | "overview"
  | "expenses"
  | "income"
  | "cashflow"
  | "netWorth"
  | "investments"
  | "debts"
  | "goals"
  | "budget"
  | "scenario"
  | "patterns"
  | "alerts"
  | "chat";

export type InsightSeverity = "info" | "attention" | "warning";

export interface FinancialEvidence {
  metric: string;
  label: string;
  current?: number;
  baseline?: number;
  variation?: number | null;
  period?: string;
  details?: string[];
}

export interface FinancialInsightItem {
  id: string;
  type: string;
  title: string;
  summary: string;
  evidence: FinancialEvidence[];
  severity: InsightSeverity;
  relatedMetric: string;
  source: string;
}

export interface FinancialAlertItem {
  id: string;
  title: string;
  summary: string;
  severity: InsightSeverity;
  evidence: FinancialEvidence[];
  source: string;
}

export interface ScenarioResult {
  id: string;
  kind: string;
  title: string;
  premises: { label: string; value: string }[];
  results: { label: string; value: string }[];
  disclaimer: string;
  raw: Record<string, number | string | null>;
}

export const AI_THRESHOLDS = {
  expenseSpikeRatio: 0.15,
  incomeDropRatio: 0.1,
  commitmentWarning: 0.7,
  commitmentAttention: 0.5,
  concentrationPct: 40,
  savingsDropPoints: 0.1,
  minHistoryMonthsForPattern: 4,
} as const;
