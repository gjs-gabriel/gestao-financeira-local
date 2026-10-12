import type {
  Account,
  CreditCard,
  CreditCardInvoice,
  InstallmentPlan,
  InvestmentPosition,
  RecurringRule,
  Transaction,
} from "./ledger-types";
import type {
  Debt,
  Goal,
  Income,
  InstallmentExpense,
  Investment,
  OneTimeExpense,
  OneTimeIncome,
  RecurringExpense,
  VaultSnapshot,
} from "./types";

export function accountBalance(
  account: Account,
  transactions: Transaction[],
): number {
  let balance = account.openingBalance;
  for (const tx of transactions) {
    if (tx.status === "ignored" || tx.status === "duplicate") continue;
    switch (tx.kind) {
      case "income":
        if (tx.accountId === account.id) balance += tx.amount;
        break;
      case "expense":
        if (tx.accountId === account.id) balance -= tx.amount;
        break;
      case "transfer":
        if (tx.accountId === account.id) balance -= tx.amount;
        if (tx.counterAccountId === account.id) balance += tx.amount;
        break;
      case "invoice_payment":
        if (tx.accountId === account.id) balance -= tx.amount;
        break;
      case "investment_buy":
        if (tx.accountId === account.id) balance -= tx.amount;
        break;
      case "investment_sell":
        if (tx.accountId === account.id) balance += tx.amount;
        break;
      case "adjustment":
        if (tx.accountId === account.id) balance += tx.amount;
        break;
      case "card_purchase":
        // Compra no cartão não mexe no saldo bancário.
        break;
      default:
        break;
    }
  }
  return Math.round(balance * 100) / 100;
}

/** Total da fatura = soma das card_purchase (+ parcelas alocadas) daquele invoice. */
export function invoiceAmount(
  invoice: CreditCardInvoice,
  transactions: Transaction[],
): number {
  return (
    Math.round(
      transactions
        .filter(
          (tx) =>
            tx.invoiceId === invoice.id &&
            tx.kind === "card_purchase" &&
            tx.status !== "ignored" &&
            tx.status !== "duplicate",
        )
        .reduce((sum, tx) => sum + tx.amount, 0) * 100,
    ) / 100
  );
}

export function cardOpenBalance(
  card: CreditCard,
  invoices: CreditCardInvoice[],
  transactions: Transaction[],
): number {
  return invoices
    .filter((inv) => inv.creditCardId === card.id && inv.status !== "paid")
    .reduce((sum, inv) => sum + invoiceAmount(inv, transactions), 0);
}

export function totalAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
): number {
  return accounts
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + accountBalance(a, transactions), 0);
}

export function totalInvestmentPositions(positions: InvestmentPosition[]): number {
  return positions.reduce((sum, p) => sum + p.amount, 0);
}

export function totalOpenInvoiceBalances(
  invoices: CreditCardInvoice[],
  transactions: Transaction[],
): number {
  return invoices
    .filter((inv) => inv.status !== "paid")
    .reduce((sum, inv) => sum + invoiceAmount(inv, transactions), 0);
}

export function sumDebtBalances(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.balance, 0);
}

/**
 * Patrimônio líquido = ativos − passivos.
 * Ativos: saldos de contas + posições de investimento.
 * Passivos: faturas em aberto + dívidas.
 * Transferências e pagamentos de fatura não alteram o PL por construção.
 */
export function netWorthLedger(input: {
  accounts: Account[];
  transactions: Transaction[];
  investments: InvestmentPosition[];
  invoices: CreditCardInvoice[];
  debts: Debt[];
}): number {
  const assets =
    totalAccountBalances(input.accounts, input.transactions) +
    totalInvestmentPositions(input.investments);
  const liabilities =
    totalOpenInvoiceBalances(input.invoices, input.transactions) +
    sumDebtBalances(input.debts);
  return Math.round((assets - liabilities) * 100) / 100;
}

/** Receitas/despesas do fluxo (exclui transferências e pagamentos de fatura). */
export function cashflowFromTransactions(
  transactions: Transaction[],
  year: number,
  month: number,
): { income: number; expense: number } {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (!tx.date.startsWith(prefix)) continue;
    if (tx.status === "ignored" || tx.status === "duplicate") continue;
    if (tx.kind === "income") income += tx.amount;
    if (tx.kind === "expense" || tx.kind === "card_purchase") expense += tx.amount;
    // transfer, invoice_payment, investment_buy/sell: fora do P&L operacional
  }
  return {
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
  };
}

export function createTransfer(input: {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
  now: string;
}): Transaction {
  return {
    id: input.id,
    kind: "transfer",
    date: input.date,
    amount: input.amount,
    description: input.description,
    status: "confirmed",
    accountId: input.fromAccountId,
    counterAccountId: input.toAccountId,
    transferGroupId: input.id,
    source: "manual",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Garante arrays do ledger presentes (schema 5). */
export function emptyLedgerFields(now: string): {
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  invoices: CreditCardInvoice[];
  installmentPlans: InstallmentPlan[];
  recurringRules: RecurringRule[];
  investmentPositions: InvestmentPosition[];
  budgets: import("./v15-types").Budget[];
  categorizationRules: import("./v15-types").CategorizationRule[];
  wealthHistory: import("./v15-types").WealthSnapshot[];
  investmentPositionHistory: import("./import-entities").DatedInvestmentPosition[];
  investmentAliases: import("./import-entities").InvestmentAlias[];
  importedDocuments: import("./import-entities").ImportedDocumentMeta[];
  statementSummaries: import("./import-entities").StatementSummary[];
} {
  void now;
  return {
    accounts: [],
    creditCards: [],
    transactions: [],
    invoices: [],
    installmentPlans: [],
    recurringRules: [],
    investmentPositions: [],
    budgets: [],
    categorizationRules: [],
    wealthHistory: [],
    investmentPositionHistory: [],
    investmentAliases: [],
    importedDocuments: [],
    statementSummaries: [],
  };
}

/** Tipos legados ainda referenciados pela UI — reexport útil para migrate. */
export type LegacyLists = {
  incomes: Income[];
  oneTimeIncomes: OneTimeIncome[];
  investments: Investment[];
  recurringExpenses: RecurringExpense[];
  oneTimeExpenses: OneTimeExpense[];
  installmentExpenses: InstallmentExpense[];
  debts: Debt[];
  goals: Goal[];
};

export function hasLedgerData(
  snapshot: Pick<VaultSnapshot, "accounts" | "transactions">,
): boolean {
  return (
    (snapshot.accounts?.length ?? 0) > 0 ||
    (snapshot.transactions?.length ?? 0) > 0
  );
}
