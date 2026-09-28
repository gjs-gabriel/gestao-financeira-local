import { normalizeToMonthly } from "./calculations";
import { expensesByCategoryForMonth } from "./calculations";
import { monthKey } from "./cashflow";
import type { Budget } from "./v15-types";
import type { VaultSnapshot } from "./types";
import type { CategorizationRule } from "./v15-types";

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  ratio: number;
  status: "ok" | "near" | "over";
}

export function budgetProgressForMonth(
  snapshot: VaultSnapshot,
  year: number,
  month: number,
): BudgetProgress[] {
  const period = monthKey(year, month);
  const byCat = expensesByCategoryForMonth(snapshot, year, month);
  const spentMap = new Map(byCat.map((r) => [r.categoryId, r.amount]));

  return (snapshot.budgets ?? [])
    .filter((b) => b.active && (!b.periodKey || b.periodKey === period))
    .map((budget) => {
      const spent = spentMap.get(budget.categoryId) ?? 0;
      const remaining = budget.limitAmount - spent;
      const ratio =
        budget.limitAmount > 0 ? spent / budget.limitAmount : spent > 0 ? 2 : 0;
      const status: BudgetProgress["status"] =
        ratio >= 1 ? "over" : ratio >= 0.8 ? "near" : "ok";
      return { budget, spent, remaining, ratio, status };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export function matchCategorizationRule(
  rules: CategorizationRule[],
  input: {
    description: string;
    institutionId?: string;
  },
): CategorizationRule | null {
  const desc = input.description.trim().toLowerCase();
  const ordered = [...rules]
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  for (const rule of ordered) {
    const needle = rule.contains.trim().toLowerCase();
    if (!needle) continue;
    if (rule.matchField === "description" && desc.includes(needle)) {
      return rule;
    }
    if (
      rule.matchField === "institution" &&
      input.institutionId &&
      (rule.institutionId === input.institutionId ||
        input.institutionId.toLowerCase().includes(needle))
    ) {
      return rule;
    }
  }
  return null;
}

export function monthlySubscriptionTotal(
  snapshot: VaultSnapshot,
): { count: number; monthly: number } {
  const rules = (snapshot.recurringRules ?? []).filter(
    (r) => r.active && r.kind === "expense",
  );
  const fromRules = rules.reduce(
    (sum, r) => sum + normalizeToMonthly(r.amount, r.frequency),
    0,
  );
  const fromLegacy = snapshot.recurringExpenses.reduce(
    (sum, e) => sum + normalizeToMonthly(e.amount, e.frequency),
    0,
  );
  // Prefer rules if present
  const monthly = rules.length > 0 ? fromRules : fromLegacy;
  const count = rules.length > 0 ? rules.length : snapshot.recurringExpenses.length;
  return {
    count,
    monthly: Math.round(monthly * 100) / 100,
  };
}
