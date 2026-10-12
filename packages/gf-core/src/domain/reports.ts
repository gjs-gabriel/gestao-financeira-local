import { annualCashflow, cashflowLastMonths, monthLabel } from "./cashflow";
import { expensesByCategoryForMonth } from "./calculations";
import { wealthBreakdown } from "./wealth";
import { monthlySubscriptionTotal } from "./budgets";
import { invoiceAmount } from "./ledger";
import type { VaultSnapshot } from "./types";

export interface ReportPeriod {
  year: number;
  month: number;
}

export function expensesByInstitutionReport(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): { name: string; amount: number }[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const map = new Map<string, number>();
  const add = (name: string, amount: number) => {
    map.set(name, (map.get(name) ?? 0) + amount);
  };
  for (const e of snapshot.oneTimeExpenses) {
    if (!e.date.startsWith(prefix)) continue;
    const name =
      snapshot.institutions.find((i) => i.id === e.institutionId)?.name ??
      e.institutionOther ??
      "Sem instituição";
    add(name, e.amount);
  }
  for (const tx of snapshot.transactions ?? []) {
    if (tx.kind !== "card_purchase" && tx.kind !== "expense") continue;
    if (!tx.date.startsWith(prefix)) continue;
    if (tx.status === "ignored" || tx.status === "duplicate") continue;
    const name =
      snapshot.institutions.find((i) => i.id === tx.institutionId)?.name ??
      tx.institutionOther ??
      "Sem instituição";
    add(name, tx.amount);
  }
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function buildMonthReport(snapshot: VaultSnapshot, year: number, month: number) {
  const series = cashflowLastMonths(snapshot, year, month, 1)[0];
  const categories = expensesByCategoryForMonth(snapshot, year, month);
  const byInstitution = expensesByInstitutionReport(snapshot, year, month);
  const wealth = wealthBreakdown(snapshot);
  const subs = monthlySubscriptionTotal(snapshot);
  const openInvoices = (snapshot.invoices ?? [])
    .filter((i) => i.status !== "paid")
    .map((inv) => ({
      id: inv.id,
      periodKey: inv.periodKey,
      dueDate: inv.dueDate,
      amount: invoiceAmount(inv, snapshot.transactions ?? []),
      card:
        snapshot.creditCards?.find((c) => c.id === inv.creditCardId)?.name ??
        "Cartão",
    }));
  return {
    label: monthLabel(year, month),
    cashflow: series,
    categories,
    byInstitution,
    wealth,
    subscriptions: subs,
    openInvoices,
    debts: snapshot.debts,
    goals: snapshot.goals,
    investments: snapshot.investments,
  };
}

export function buildAnnualReport(snapshot: VaultSnapshot, year: number) {
  return annualCashflow(snapshot, year);
}
