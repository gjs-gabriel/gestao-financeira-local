/**
 * Fase 2 — dual-write: listas legadas (UI atual) ↔ ledger (fonte futura).
 * Cada mutação atualiza os dois lados com IDs estáveis e relacionáveis.
 */

import type {
  Account,
  InstallmentPlan,
  InvestmentPosition,
  RecurringRule,
  Transaction,
} from "./ledger-types";
import { removeEntity, upsertEntity, createId } from "./snapshot";
import type {
  Income,
  InstallmentExpense,
  Investment,
  OneTimeExpense,
  OneTimeIncome,
  RecurringExpense,
  VaultSnapshot,
} from "./types";

export function defaultAccountId(snapshot: VaultSnapshot): string {
  const active = (snapshot.accounts ?? []).find((a) => a.status === "active");
  if (active) return active.id;
  if (snapshot.accounts?.[0]) return snapshot.accounts[0].id;
  return "acc_principal";
}

function ensureAccounts(snapshot: VaultSnapshot): VaultSnapshot {
  if ((snapshot.accounts ?? []).length > 0) return snapshot;
  const now = new Date().toISOString();
  const account: Account = {
    id: "acc_principal",
    name: "Conta principal",
    type: "checking",
    openingBalance: 0,
    openingDate: now.slice(0, 10),
    currency: "BRL",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  return upsertEntity(snapshot, "accounts", account);
}

function ruleIdFromIncome(id: string) {
  return id.startsWith("rule_") ? id : `rule_${id}`;
}

function ruleIdFromRecurringExpense(id: string) {
  return id.startsWith("rule_") ? id : `rule_${id}`;
}

function txIdFromOneTime(id: string, kind: "income" | "expense") {
  if (id.startsWith("tx_")) return id;
  return kind === "income" ? `tx_${id}` : `tx_${id}`;
}

function planIdFromInstallment(id: string) {
  return id.startsWith("plan_") ? id : `plan_${id}`;
}

function positionIdFromInvestment(id: string) {
  return id.startsWith("inv_") && id.includes("_") ? id : `inv_${id}`;
}

export function upsertIncomeSynced(
  snapshot: VaultSnapshot,
  item: Income,
): VaultSnapshot {
  let next = ensureAccounts(snapshot);
  const accountId = defaultAccountId(next);
  next = upsertEntity(next, "incomes", item);
  const rule: RecurringRule = {
    id: ruleIdFromIncome(item.id),
    kind: "income",
    name: item.name,
    amount: item.amount,
    frequency: "monthly",
    dayOfMonth: item.dayOfMonth,
    incomeType: item.type,
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    active: true,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  return upsertEntity(next, "recurringRules", rule);
}

export function removeIncomeSynced(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  let next = removeEntity(snapshot, "incomes", id);
  next = removeEntity(next, "recurringRules", ruleIdFromIncome(id));
  return next;
}

export function upsertRecurringExpenseSynced(
  snapshot: VaultSnapshot,
  item: RecurringExpense,
): VaultSnapshot {
  let next = ensureAccounts(snapshot);
  const accountId = defaultAccountId(next);
  next = upsertEntity(next, "recurringExpenses", item);
  const rule: RecurringRule = {
    id: ruleIdFromRecurringExpense(item.id),
    kind: "expense",
    name: item.name,
    amount: item.amount,
    frequency: item.frequency,
    categoryId: item.categoryId,
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    active: true,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  return upsertEntity(next, "recurringRules", rule);
}

export function removeRecurringExpenseSynced(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  let next = removeEntity(snapshot, "recurringExpenses", id);
  next = removeEntity(next, "recurringRules", ruleIdFromRecurringExpense(id));
  return next;
}

export function upsertOneTimeExpenseSynced(
  snapshot: VaultSnapshot,
  item: OneTimeExpense,
  opts?: {
    source?: Transaction["source"];
    accountId?: string;
    importHash?: string;
  },
): VaultSnapshot {
  let next = ensureAccounts(snapshot);
  const accountId = opts?.accountId ?? defaultAccountId(next);
  next = upsertEntity(next, "oneTimeExpenses", item);
  const tx: Transaction = {
    id: txIdFromOneTime(item.id, "expense"),
    kind: "expense",
    date: item.date,
    amount: item.amount,
    description: item.name,
    categoryId: item.categoryId,
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    status: "confirmed",
    source: opts?.source ?? "manual",
    importHash: opts?.importHash,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  return upsertEntity(next, "transactions", tx);
}

export function removeOneTimeExpenseSynced(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  let next = removeEntity(snapshot, "oneTimeExpenses", id);
  next = removeEntity(next, "transactions", txIdFromOneTime(id, "expense"));
  return next;
}

export function upsertOneTimeIncomeSynced(
  snapshot: VaultSnapshot,
  item: OneTimeIncome,
  opts?: {
    source?: Transaction["source"];
    accountId?: string;
    importHash?: string;
  },
): VaultSnapshot {
  let next = ensureAccounts(snapshot);
  const accountId = opts?.accountId ?? defaultAccountId(next);
  next = upsertEntity(next, "oneTimeIncomes", item);
  const tx: Transaction = {
    id: txIdFromOneTime(item.id, "income"),
    kind: "income",
    date: item.date,
    amount: item.amount,
    description: item.name,
    categoryId: item.categoryId,
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    status: "confirmed",
    source: opts?.source ?? "manual",
    importHash: opts?.importHash,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  return upsertEntity(next, "transactions", tx);
}

export function removeOneTimeIncomeSynced(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  let next = removeEntity(snapshot, "oneTimeIncomes", id);
  next = removeEntity(next, "transactions", txIdFromOneTime(id, "income"));
  return next;
}

export function upsertInstallmentSynced(
  snapshot: VaultSnapshot,
  item: InstallmentExpense,
): VaultSnapshot {
  let next = ensureAccounts(snapshot);
  const accountId = defaultAccountId(next);
  next = upsertEntity(next, "installmentExpenses", item);
  const plan: InstallmentPlan = {
    id: planIdFromInstallment(item.id),
    name: item.name,
    installmentAmount: item.installmentAmount,
    totalInstallments: item.totalInstallments,
    startDate: item.startDate,
    categoryId: item.categoryId,
    channel: "account",
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  return upsertEntity(next, "installmentPlans", plan);
}

export function removeInstallmentSynced(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  let next = removeEntity(snapshot, "installmentExpenses", id);
  next = removeEntity(next, "installmentPlans", planIdFromInstallment(id));
  return next;
}

export function upsertInvestmentSynced(
  snapshot: VaultSnapshot,
  item: Investment,
): VaultSnapshot {
  let next = ensureAccounts(snapshot);
  next = upsertEntity(next, "investments", item);
  const position: InvestmentPosition = {
    id: positionIdFromInvestment(item.id),
    name: item.name,
    amount: item.amount,
    classification: item.classification,
    categoryId: item.categoryId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  return upsertEntity(next, "investmentPositions", position);
}

export function removeInvestmentSynced(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  let next = removeEntity(snapshot, "investments", id);
  next = removeEntity(next, "investmentPositions", positionIdFromInvestment(id));
  return next;
}

export function upsertAccount(
  snapshot: VaultSnapshot,
  account: Account,
): VaultSnapshot {
  return upsertEntity(ensureAccounts(snapshot), "accounts", account);
}

export function removeAccount(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  const accounts = snapshot.accounts ?? [];
  if (accounts.length <= 1) {
    throw new Error("É preciso manter ao menos uma conta");
  }
  const used =
    (snapshot.transactions ?? []).some(
      (tx) => tx.accountId === id || tx.counterAccountId === id,
    ) ||
    (snapshot.recurringRules ?? []).some((r) => r.accountId === id) ||
    (snapshot.creditCards ?? []).some((c) => c.paymentAccountId === id);
  if (used) {
    throw new Error(
      "Conta em uso em lançamentos ou cartões — archive ou mova os vínculos antes",
    );
  }
  return removeEntity(snapshot, "accounts", id);
}

export function archiveAccount(
  snapshot: VaultSnapshot,
  id: string,
): VaultSnapshot {
  const account = (snapshot.accounts ?? []).find((a) => a.id === id);
  if (!account) return snapshot;
  return upsertEntity(snapshot, "accounts", {
    ...account,
    status: "archived",
    updatedAt: new Date().toISOString(),
  });
}

export function createAccountDraft(
  partial: Partial<Account> & Pick<Account, "name" | "type">,
): Account {
  const now = new Date().toISOString();
  return {
    id: createId("acc"),
    name: partial.name,
    type: partial.type,
    openingBalance: partial.openingBalance ?? 0,
    openingDate: partial.openingDate ?? now.slice(0, 10),
    currency: "BRL",
    status: partial.status ?? "active",
    institutionId: partial.institutionId,
    institutionOther: partial.institutionOther,
    notes: partial.notes,
    createdAt: now,
    updatedAt: now,
  };
}
