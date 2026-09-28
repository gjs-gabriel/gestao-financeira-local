import type {
  Debt,
  Goal,
  Income,
  InstallmentExpense,
  Investment,
  OneTimeExpense,
  RecurrenceFrequency,
  RecurringExpense,
  VaultSnapshot,
} from "./types";

/** Converte um valor com recorrência para equivalente mensal. */
export function normalizeToMonthly(
  amount: number,
  frequency: RecurrenceFrequency,
): number {
  switch (frequency) {
    case "daily":
      return amount * (365.25 / 12);
    case "weekly":
      return amount * (52 / 12);
    case "monthly":
      return amount;
    case "yearly":
      return amount / 12;
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

export function totalMonthlyIncome(incomes: Income[]): number {
  return incomes.reduce((sum, i) => sum + i.amount, 0);
}

export function totalMonthlyRecurringExpenses(
  expenses: RecurringExpense[],
): number {
  return expenses.reduce(
    (sum, e) => sum + normalizeToMonthly(e.amount, e.frequency),
    0,
  );
}

function yearMonthFromIso(date: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Índice 0 da parcela que cai em (year, month), ou null se fora do plano. */
export function installmentIndexAt(
  expense: Pick<InstallmentExpense, "startDate" | "totalInstallments">,
  year: number,
  month: number,
): number | null {
  const start = yearMonthFromIso(expense.startDate);
  if (!start || expense.totalInstallments < 1) return null;
  const index = (year - start.year) * 12 + (month - start.month);
  if (index < 0 || index >= expense.totalInstallments) return null;
  return index;
}

export function totalInstallmentExpensesForMonth(
  expenses: InstallmentExpense[],
  year: number,
  month: number,
): number {
  return expenses.reduce((sum, expense) => {
    if (installmentIndexAt(expense, year, month) === null) return sum;
    return sum + expense.installmentAmount;
  }, 0);
}

export function totalOneTimeExpensesForMonth(
  expenses: OneTimeExpense[],
  year: number,
  month: number, // 1-12
): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return expenses
    .filter((e) => e.date.startsWith(prefix))
    .reduce((sum, e) => sum + e.amount, 0);
}

export function totalInvestments(investments: Investment[]): number {
  return investments.reduce((sum, i) => sum + i.amount, 0);
}

export function totalDebts(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.balance, 0);
}

/** Patrimônio líquido = aplicações − dívidas. */
export function netWorth(
  investments: Investment[],
  debts: Debt[],
): number {
  return totalInvestments(investments) - totalDebts(debts);
}

export interface MonthlyCashflow {
  income: number;
  recurringExpenses: number;
  oneTimeExpenses: number;
  installmentExpenses: number;
  totalExpenses: number;
  surplus: number;
}

export function monthlyCashflow(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): MonthlyCashflow {
  const recurringIncome = totalMonthlyIncome(snapshot.incomes);
  const oneTimeIncome = (snapshot.oneTimeIncomes ?? [])
    .filter((i) =>
      i.date.startsWith(`${year}-${String(month).padStart(2, "0")}`),
    )
    .reduce((sum, i) => sum + i.amount, 0);
  const income = recurringIncome + oneTimeIncome;
  const recurringExpenses = totalMonthlyRecurringExpenses(
    snapshot.recurringExpenses,
  );
  const oneTimeExpenses = totalOneTimeExpensesForMonth(
    snapshot.oneTimeExpenses,
    year,
    month,
  );
  const installmentExpenses = totalInstallmentExpensesForMonth(
    snapshot.installmentExpenses ?? [],
    year,
    month,
  );
  const cardPurchases = (snapshot.transactions ?? [])
    .filter(
      (tx) =>
        tx.kind === "card_purchase" &&
        tx.status !== "ignored" &&
        tx.status !== "duplicate" &&
        tx.date.startsWith(`${year}-${String(month).padStart(2, "0")}`),
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
  const oneTimeWithCards = oneTimeExpenses + cardPurchases;
  const totalExpenses =
    recurringExpenses + oneTimeWithCards + installmentExpenses;
  return {
    income,
    recurringExpenses,
    oneTimeExpenses: oneTimeWithCards,
    installmentExpenses,
    totalExpenses,
    surplus: income - totalExpenses,
  };
}

export function goalProgress(goal: Goal): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(1, Math.max(0, goal.currentAmount / goal.targetAmount));
}

export function investmentsByClassification(
  investments: Investment[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const inv of investments) {
    map[inv.classification] = (map[inv.classification] ?? 0) + inv.amount;
  }
  return map;
}

export function expensesByCategoryForMonth(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): { categoryId: string; categoryName: string; amount: number }[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const totals = new Map<string, number>();

  for (const e of snapshot.recurringExpenses) {
    const key = e.categoryId ?? "_none";
    const monthly = normalizeToMonthly(e.amount, e.frequency);
    totals.set(key, (totals.get(key) ?? 0) + monthly);
  }
  for (const e of snapshot.oneTimeExpenses) {
    if (!e.date.startsWith(prefix)) continue;
    const key = e.categoryId ?? "_none";
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  for (const e of snapshot.installmentExpenses ?? []) {
    if (installmentIndexAt(e, year, month) === null) continue;
    const key = e.categoryId ?? "_none";
    totals.set(key, (totals.get(key) ?? 0) + e.installmentAmount);
  }
  for (const tx of snapshot.transactions ?? []) {
    if (tx.kind !== "card_purchase") continue;
    if (tx.status === "ignored" || tx.status === "duplicate") continue;
    if (!tx.date.startsWith(prefix)) continue;
    const key = tx.categoryId ?? "_none";
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }

  const catName = (id: string) =>
    id === "_none"
      ? "Sem categoria"
      : (snapshot.categories.find((c) => c.id === id)?.name ?? "Categoria");

  return [...totals.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: catName(categoryId),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}
