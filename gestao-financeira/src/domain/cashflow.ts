import type { VaultSnapshot } from "./types";
import {
  monthlyCashflow,
  totalMonthlyIncome,
  type MonthlyCashflow,
} from "./calculations";

export interface CashflowMonthPoint extends MonthlyCashflow {
  year: number;
  month: number; // 1-12
  /** YYYY-MM */
  key: string;
  label: string;
  recurringIncome: number;
  oneTimeIncome: number;
}

export interface AnnualCashflow {
  year: number;
  months: CashflowMonthPoint[];
  totals: MonthlyCashflow & {
    recurringIncome: number;
    oneTimeIncome: number;
  };
}

const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]}/${year}`;
}

export function totalOneTimeIncomesForMonth(
  incomes: { date: string; amount: number }[],
  year: number,
  month: number,
): number {
  const prefix = monthKey(year, month);
  return incomes
    .filter((i) => i.date.startsWith(prefix))
    .reduce((sum, i) => sum + i.amount, 0);
}

export function monthlyCashflowDetailed(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): MonthlyCashflow & { recurringIncome: number; oneTimeIncome: number } {
  const recurringIncome = totalMonthlyIncome(snapshot.incomes);
  const oneTimeIncome = totalOneTimeIncomesForMonth(
    snapshot.oneTimeIncomes,
    year,
    month,
  );
  const base = monthlyCashflow(snapshot, year, month);
  return {
    ...base,
    recurringIncome,
    oneTimeIncome,
  };
}

/** Série dos últimos `count` meses terminando em (endYear, endMonth). */
export function cashflowLastMonths(
  snapshot: VaultSnapshot,
  endYear: number,
  endMonth: number,
  count = 12,
): CashflowMonthPoint[] {
  const points: CashflowMonthPoint[] = [];
  let y = endYear;
  let m = endMonth;
  for (let i = 0; i < count; i++) {
    const detailed = monthlyCashflowDetailed(snapshot, y, m);
    points.unshift({
      year: y,
      month: m,
      key: monthKey(y, m),
      label: monthLabel(y, m),
      ...detailed,
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return points;
}

export function annualCashflow(
  snapshot: VaultSnapshot,
  year: number,
): AnnualCashflow {
  const months: CashflowMonthPoint[] = [];
  const totals = {
    income: 0,
    recurringExpenses: 0,
    oneTimeExpenses: 0,
    installmentExpenses: 0,
    totalExpenses: 0,
    surplus: 0,
    recurringIncome: 0,
    oneTimeIncome: 0,
  };
  for (let month = 1; month <= 12; month++) {
    const detailed = monthlyCashflowDetailed(snapshot, year, month);
    months.push({
      year,
      month,
      key: monthKey(year, month),
      label: monthLabel(year, month),
      ...detailed,
    });
    totals.income += detailed.income;
    totals.recurringExpenses += detailed.recurringExpenses;
    totals.oneTimeExpenses += detailed.oneTimeExpenses;
    totals.installmentExpenses += detailed.installmentExpenses;
    totals.totalExpenses += detailed.totalExpenses;
    totals.surplus += detailed.surplus;
    totals.recurringIncome += detailed.recurringIncome;
    totals.oneTimeIncome += detailed.oneTimeIncome;
  }
  return { year, months, totals };
}

export function listYearsAround(center: number, span = 2): number[] {
  const years: number[] = [];
  for (let y = center - span; y <= center + span; y++) years.push(y);
  return years;
}
