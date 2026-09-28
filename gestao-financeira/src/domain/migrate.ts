import { createId } from "./snapshot";
import type {
  Account,
  InstallmentPlan,
  InvestmentPosition,
  RecurringRule,
  Transaction,
} from "./ledger-types";
import { emptyLedgerFields } from "./ledger";
import type {
  Income,
  InstallmentExpense,
  Investment,
  OneTimeExpense,
  OneTimeIncome,
  RecurringExpense,
  VaultSnapshot,
} from "./types";

const DEFAULT_ACCOUNT_ID = "acc_principal";

function ensureDefaultAccount(now: string, openingDate: string): Account {
  return {
    id: DEFAULT_ACCOUNT_ID,
    name: "Conta principal",
    type: "checking",
    openingBalance: 0,
    openingDate,
    currency: "BRL",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function incomeToRule(income: Income, accountId: string): RecurringRule {
  return {
    id: income.id.startsWith("rule_") ? income.id : `rule_${income.id}`,
    kind: "income",
    name: income.name,
    amount: income.amount,
    frequency: "monthly",
    dayOfMonth: income.dayOfMonth,
    incomeType: income.type,
    accountId,
    institutionId: income.institutionId,
    institutionOther: income.institutionOther,
    active: true,
    notes: income.notes,
    createdAt: income.createdAt,
    updatedAt: income.updatedAt,
  };
}

function recurringExpenseToRule(
  expense: RecurringExpense,
  accountId: string,
): RecurringRule {
  return {
    id: expense.id.startsWith("rule_") ? expense.id : `rule_${expense.id}`,
    kind: "expense",
    name: expense.name,
    amount: expense.amount,
    frequency: expense.frequency,
    categoryId: expense.categoryId,
    accountId,
    institutionId: expense.institutionId,
    institutionOther: expense.institutionOther,
    active: true,
    notes: expense.notes,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

function oneTimeIncomeToTx(
  item: OneTimeIncome,
  accountId: string,
): Transaction {
  return {
    id: item.id.startsWith("tx_") ? item.id : `tx_${item.id}`,
    kind: "income",
    date: item.date,
    amount: item.amount,
    description: item.name,
    categoryId: item.categoryId,
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    status: "confirmed",
    source: "system",
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function oneTimeExpenseToTx(
  item: OneTimeExpense,
  accountId: string,
): Transaction {
  return {
    id: item.id.startsWith("tx_") ? item.id : `tx_${item.id}`,
    kind: "expense",
    date: item.date,
    amount: item.amount,
    description: item.name,
    categoryId: item.categoryId,
    accountId,
    institutionId: item.institutionId,
    institutionOther: item.institutionOther,
    status: "confirmed",
    source: "system",
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function installmentToPlan(
  item: InstallmentExpense,
  accountId: string,
): InstallmentPlan {
  return {
    id: item.id.startsWith("plan_") ? item.id : `plan_${item.id}`,
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
}

function investmentToPosition(item: Investment): InvestmentPosition {
  return {
    id: item.id.startsWith("inv_") ? item.id : `inv_${item.id}`,
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
}

/**
 * Constrói o ledger a partir das listas legadas (schema ≤3).
 * Não remove os arrays legados — a UI antiga continua funcionando (Fase 2).
 */
export function buildLedgerFromLegacy(
  snapshot: Omit<
    VaultSnapshot,
    | "accounts"
    | "creditCards"
    | "transactions"
    | "invoices"
    | "installmentPlans"
    | "recurringRules"
    | "investmentPositions"
    | "schemaVersion"
  > & { schemaVersion?: number },
  now = new Date().toISOString(),
): Pick<
  VaultSnapshot,
  | "accounts"
  | "creditCards"
  | "transactions"
  | "invoices"
  | "installmentPlans"
  | "recurringRules"
  | "investmentPositions"
  | "budgets"
  | "categorizationRules"
  | "wealthHistory"
> {
  const openingDate = now.slice(0, 10);
  const empty = emptyLedgerFields(now);

  // Já migrado / parcialmente preenchido
  if (
    Array.isArray((snapshot as VaultSnapshot).accounts) &&
    ((snapshot as VaultSnapshot).accounts?.length ?? 0) > 0
  ) {
    const s = snapshot as VaultSnapshot;
    return {
      accounts: s.accounts ?? empty.accounts,
      creditCards: s.creditCards ?? empty.creditCards,
      transactions: s.transactions ?? empty.transactions,
      invoices: s.invoices ?? empty.invoices,
      installmentPlans: s.installmentPlans ?? empty.installmentPlans,
      recurringRules: s.recurringRules ?? empty.recurringRules,
      investmentPositions:
        s.investmentPositions ??
        (s.investments ?? []).map(investmentToPosition),
      budgets: s.budgets ?? empty.budgets,
      categorizationRules:
        s.categorizationRules ?? empty.categorizationRules,
      wealthHistory: s.wealthHistory ?? empty.wealthHistory,
    };
  }

  const account = ensureDefaultAccount(now, openingDate);
  const accountId = account.id;

  const recurringRules: RecurringRule[] = [
    ...(snapshot.incomes ?? []).map((i) => incomeToRule(i, accountId)),
    ...(snapshot.recurringExpenses ?? []).map((e) =>
      recurringExpenseToRule(e, accountId),
    ),
  ];

  const transactions: Transaction[] = [
    ...(snapshot.oneTimeIncomes ?? []).map((i) =>
      oneTimeIncomeToTx(i, accountId),
    ),
    ...(snapshot.oneTimeExpenses ?? []).map((e) =>
      oneTimeExpenseToTx(e, accountId),
    ),
  ];

  const installmentPlans: InstallmentPlan[] = (
    snapshot.installmentExpenses ?? []
  ).map((p) => installmentToPlan(p, accountId));

  const investmentPositions: InvestmentPosition[] = (
    snapshot.investments ?? []
  ).map(investmentToPosition);

  return {
    accounts: [account],
    creditCards: [],
    transactions,
    invoices: [],
    installmentPlans,
    recurringRules,
    investmentPositions,
    budgets: empty.budgets,
    categorizationRules: empty.categorizationRules,
    wealthHistory: empty.wealthHistory,
  };
}

export function createAccountId(): string {
  return createId("acc");
}
