import { budgetProgressForMonth } from "./budgets";
import { invoiceAmount } from "./ledger";
import { projectedCashflow } from "./insights";
import { goalProgress } from "./calculations";
import type { Alert } from "./v15-types";
import type { VaultSnapshot } from "./types";
import { createId } from "./ids";

/** Gera alertas locais a partir do estado atual (não persiste). */
export function computeAlerts(
  snapshot: VaultSnapshot,
  today = new Date(),
): Alert[] {
  const now = today.toISOString();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const todayStr = now.slice(0, 10);
  const alerts: Alert[] = [];

  for (const row of budgetProgressForMonth(snapshot, year, month)) {
    if (row.status === "near") {
      alerts.push({
        id: createId("alrt"),
        kind: "budget_near",
        severity: "warning",
        title: `Orçamento perto do limite: ${row.budget.name}`,
        message: `Usado ${Math.round(row.ratio * 100)}% de ${row.budget.limitAmount.toFixed(2)}.`,
        relatedId: row.budget.id,
        createdAt: now,
      });
    }
    if (row.status === "over") {
      alerts.push({
        id: createId("alrt"),
        kind: "budget_over",
        severity: "critical",
        title: `Orçamento estourado: ${row.budget.name}`,
        message: `Gasto ${row.spent.toFixed(2)} acima do limite ${row.budget.limitAmount.toFixed(2)}.`,
        relatedId: row.budget.id,
        createdAt: now,
      });
    }
  }

  for (const inv of snapshot.invoices ?? []) {
    if (inv.status === "paid") continue;
    const amount = invoiceAmount(inv, snapshot.transactions ?? []);
    if (amount <= 0) continue;
    const days =
      (new Date(inv.dueDate).getTime() - new Date(todayStr).getTime()) /
      86_400_000;
    if (days >= 0 && days <= 7) {
      const card = snapshot.creditCards?.find((c) => c.id === inv.creditCardId);
      alerts.push({
        id: createId("alrt"),
        kind: "invoice_due",
        severity: days <= 2 ? "critical" : "warning",
        title: `Fatura ${card?.name ?? "cartão"} vence em breve`,
        message: `Vencimento ${inv.dueDate} · R$ ${amount.toFixed(2)}.`,
        date: inv.dueDate,
        relatedId: inv.id,
        createdAt: now,
      });
    }
  }

  const projection = projectedCashflow(snapshot, year, month, 3, today);
  for (const p of projection) {
    if (p.projected && p.surplus < 0) {
      alerts.push({
        id: createId("alrt"),
        kind: "projected_negative",
        severity: "warning",
        title: `Saldo projetado negativo em ${p.label}`,
        message: `Saídas previstas acima das entradas neste mês.`,
        relatedId: p.key,
        createdAt: now,
      });
      break;
    }
  }

  for (const goal of snapshot.goals) {
    if (goalProgress(goal) >= 1) {
      alerts.push({
        id: createId("alrt"),
        kind: "goal_reached",
        severity: "info",
        title: `Meta atingida: ${goal.name}`,
        message: `Você alcançou o valor-alvo de R$ ${goal.targetAmount.toFixed(2)}.`,
        relatedId: goal.id,
        createdAt: now,
      });
    }
  }

  for (const debt of snapshot.debts) {
    if (!debt.dueDate) continue;
    const days =
      (new Date(debt.dueDate).getTime() - new Date(todayStr).getTime()) /
      86_400_000;
    if (days >= 0 && days <= 14) {
      alerts.push({
        id: createId("alrt"),
        kind: "debt_due",
        severity: "warning",
        title: `Dívida próxima: ${debt.name}`,
        message: `Vencimento ${debt.dueDate} · saldo R$ ${debt.balance.toFixed(2)}.`,
        date: debt.dueDate,
        relatedId: debt.id,
        createdAt: now,
      });
    }
  }

  return alerts;
}
