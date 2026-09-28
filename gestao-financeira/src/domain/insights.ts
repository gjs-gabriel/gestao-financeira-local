import type { VaultSnapshot } from "./types";
import {
  installmentIndexAt,
  monthlyCashflow,
  normalizeToMonthly,
  type MonthlyCashflow,
} from "./calculations";
import { monthKey, monthLabel, monthlyCashflowDetailed } from "./cashflow";

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  const yearOut = Math.floor(index / 12);
  const monthOut = index - yearOut * 12 + 1;
  return { year: yearOut, month: monthOut };
}

/** Parte da receita tomada pelos gastos, o que sobra e o que passou da receita. */
export function commitmentSplit(income: number, expenses: number): {
  comprometido: number;
  disponivel: number;
  acima: number;
} {
  const ganhos = Math.max(income, 0);
  const gastos = Math.max(expenses, 0);
  return {
    comprometido: Math.min(gastos, ganhos),
    disponivel: Math.max(ganhos - gastos, 0),
    acima: Math.max(gastos - ganhos, 0),
  };
}

/** Variação percentual. Null quando o mês anterior é zero e o atual não. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface IncomeCommitment {
  income: number;
  recurring: number;
  installments: number;
  oneTime: number;
  committed: number;
  available: number;
  /** 0–1, ou null se não há renda. */
  ratio: number | null;
}

export function incomeCommitment(cash: MonthlyCashflow): IncomeCommitment {
  const committed = cash.totalExpenses;
  return {
    income: cash.income,
    recurring: cash.recurringExpenses,
    installments: cash.installmentExpenses,
    oneTime: cash.oneTimeExpenses,
    committed,
    available: cash.income - committed,
    ratio: cash.income > 0 ? committed / cash.income : null,
  };
}

export interface MonthInstallmentLoad {
  year: number;
  month: number;
  key: string;
  label: string;
  amount: number;
}

export function installmentLoadByMonth(
  snapshot: VaultSnapshot,
  startYear: number,
  startMonth: number,
  count: number,
): MonthInstallmentLoad[] {
  const points: MonthInstallmentLoad[] = [];
  let year = startYear;
  let month = startMonth;
  for (let i = 0; i < count; i++) {
    const cash = monthlyCashflow(snapshot, year, month);
    points.push({
      year,
      month,
      key: monthKey(year, month),
      label: monthLabel(year, month),
      amount: cash.installmentExpenses,
    });
    const next = shiftMonth(year, month, 1);
    year = next.year;
    month = next.month;
  }
  return points;
}

export interface ProjectedMonth {
  year: number;
  month: number;
  key: string;
  label: string;
  income: number;
  expenses: number;
  surplus: number;
  projected: boolean;
}

export function projectedCashflow(
  snapshot: VaultSnapshot,
  startYear: number,
  startMonth: number,
  count: number,
  today = new Date(),
): ProjectedMonth[] {
  const todayKey = monthKey(today.getFullYear(), today.getMonth() + 1);
  const points: ProjectedMonth[] = [];
  let year = startYear;
  let month = startMonth;
  for (let i = 0; i < count; i++) {
    const cash = monthlyCashflowDetailed(snapshot, year, month);
    const key = monthKey(year, month);
    points.push({
      year,
      month,
      key,
      label: monthLabel(year, month),
      income: cash.income,
      expenses: cash.totalExpenses,
      surplus: cash.surplus,
      projected: key > todayKey,
    });
    const next = shiftMonth(year, month, 1);
    year = next.year;
    month = next.month;
  }
  return points;
}

export interface ExpenseLine {
  id: string;
  name: string;
  amount: number;
  kind: "recorrente" | "pontual" | "parcela";
  categoryId?: string;
  categoryName: string;
  detail: string;
}

function categoryName(snapshot: VaultSnapshot, id?: string) {
  if (!id) return "Sem categoria";
  return snapshot.categories.find((c) => c.id === id)?.name ?? "Categoria";
}

export function expenseLinesForMonth(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): ExpenseLine[] {
  const prefix = monthKey(year, month);
  const lines: ExpenseLine[] = [];
  for (const expense of snapshot.recurringExpenses) {
    lines.push({
      id: expense.id,
      name: expense.name,
      amount: normalizeToMonthly(expense.amount, expense.frequency),
      kind: "recorrente",
      categoryId: expense.categoryId,
      categoryName: categoryName(snapshot, expense.categoryId),
      detail: "Recorrente no mês",
    });
  }
  for (const expense of snapshot.oneTimeExpenses) {
    if (!expense.date.startsWith(prefix)) continue;
    lines.push({
      id: expense.id,
      name: expense.name,
      amount: expense.amount,
      kind: "pontual",
      categoryId: expense.categoryId,
      categoryName: categoryName(snapshot, expense.categoryId),
      detail: expense.date,
    });
  }
  for (const expense of snapshot.installmentExpenses ?? []) {
    const index = installmentIndexAt(expense, year, month);
    if (index === null) continue;
    lines.push({
      id: expense.id,
      name: expense.name,
      amount: expense.installmentAmount,
      kind: "parcela",
      categoryId: expense.categoryId,
      categoryName: categoryName(snapshot, expense.categoryId),
      detail: `Parcela ${index + 1}/${expense.totalInstallments}`,
    });
  }
  return lines.sort((a, b) => b.amount - a.amount);
}

export function categoryTrend(
  snapshot: VaultSnapshot,
  endYear: number,
  endMonth: number,
  count: number,
): { categoryId: string; categoryName: string; points: { key: string; label: string; amount: number }[] }[] {
  const months: { year: number; month: number; key: string; label: string }[] = [];
  let year = endYear;
  let month = endMonth;
  for (let i = 0; i < count; i++) {
    months.unshift({
      year,
      month,
      key: monthKey(year, month),
      label: monthLabel(year, month),
    });
    const prev = shiftMonth(year, month, -1);
    year = prev.year;
    month = prev.month;
  }
  const totals = new Map<string, { name: string; points: Map<string, number> }>();
  for (const slot of months) {
    for (const line of expenseLinesForMonth(snapshot, slot.year, slot.month)) {
      const id = line.categoryId ?? "_none";
      let row = totals.get(id);
      if (!row) {
        row = { name: line.categoryName, points: new Map() };
        totals.set(id, row);
      }
      row.points.set(slot.key, (row.points.get(slot.key) ?? 0) + line.amount);
    }
  }
  return [...totals.entries()]
    .map(([categoryId, row]) => ({
      categoryId,
      categoryName: row.name,
      points: months.map((slot) => ({
        key: slot.key,
        label: slot.label,
        amount: row.points.get(slot.key) ?? 0,
      })),
    }))
    .sort((a, b) => {
      const sum = (points: { amount: number }[]) =>
        points.reduce((acc, point) => acc + point.amount, 0);
      return sum(b.points) - sum(a.points);
    });
}

export interface CalendarEvent {
  date: string;
  name: string;
  amount: number;
  direction: "in" | "out";
  kind: string;
}

export function calendarEvents(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): CalendarEvent[] {
  const prefix = monthKey(year, month);
  const events: CalendarEvent[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (const income of snapshot.incomes) {
    const day = Math.min(income.dayOfMonth ?? 1, daysInMonth);
    events.push({
      date: `${prefix}-${String(day).padStart(2, "0")}`,
      name: income.name,
      amount: income.amount,
      direction: "in",
      kind: "Renda",
    });
  }
  for (const income of snapshot.oneTimeIncomes) {
    if (!income.date.startsWith(prefix)) continue;
    events.push({
      date: income.date.slice(0, 10),
      name: income.name,
      amount: income.amount,
      direction: "in",
      kind: "Entrada",
    });
  }
  for (const expense of snapshot.oneTimeExpenses) {
    if (!expense.date.startsWith(prefix)) continue;
    events.push({
      date: expense.date.slice(0, 10),
      name: expense.name,
      amount: expense.amount,
      direction: "out",
      kind: "Gasto",
    });
  }
  for (const expense of snapshot.installmentExpenses ?? []) {
    if (installmentIndexAt(expense, year, month) === null) continue;
    const startDay = Number(expense.startDate.slice(8, 10)) || 1;
    const day = Math.min(startDay, daysInMonth);
    events.push({
      date: `${prefix}-${String(day).padStart(2, "0")}`,
      name: expense.name,
      amount: expense.installmentAmount,
      direction: "out",
      kind: "Parcela",
    });
  }
  for (const debt of snapshot.debts) {
    if (!debt.dueDate?.startsWith(prefix)) continue;
    events.push({
      date: debt.dueDate.slice(0, 10),
      name: debt.name,
      amount: debt.balance,
      direction: "out",
      kind: "Vencimento",
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}
