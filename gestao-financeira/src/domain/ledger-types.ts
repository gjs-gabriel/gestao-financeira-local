/**
 * Ledger V1.5 — Conta + Transação (+ cartão/fatura).
 * Tipos puros; regras de saldo/PL em ledger.ts.
 */

import type { CategoryKind, RecurrenceFrequency, WithInstitution } from "./types";

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "investment_cash"
  | "other";

export type AccountStatus = "active" | "archived";

export interface Account extends WithInstitution {
  id: string;
  name: string;
  type: AccountType;
  /** Saldo inicial em BRL na openingDate (ou createdAt). */
  openingBalance: number;
  /** ISO YYYY-MM-DD */
  openingDate: string;
  currency: "BRL";
  status: AccountStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "card_purchase"
  | "invoice_payment"
  | "investment_buy"
  | "investment_sell"
  | "adjustment";

export type TransactionStatus =
  | "confirmed"
  | "pending"
  | "ignored"
  | "duplicate";

export interface Transaction {
  id: string;
  kind: TransactionKind;
  /** ISO YYYY-MM-DD */
  date: string;
  /** Sempre ≥ 0; a direção vem do kind / from-to. */
  amount: number;
  description: string;
  categoryId?: string;
  notes?: string;
  status: TransactionStatus;
  /** Conta debitada (saída / origem da transferência / pagamento). */
  accountId?: string;
  /** Conta creditada (entrada / destino da transferência). */
  counterAccountId?: string;
  /** Cartão em compras / fatura. */
  creditCardId?: string;
  invoiceId?: string;
  installmentPlanId?: string;
  /** Liga as duas pernas de uma transferência (mesmo id nos dois lançamentos ou um único registro). */
  transferGroupId?: string;
  institutionId?: string;
  institutionOther?: string;
  /** Origem: manual | import | system */
  source?: "manual" | "import" | "system";
  importHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCard extends WithInstitution {
  id: string;
  name: string;
  limit: number;
  /** Dia do mês 1–28 (fechamento). */
  closingDay: number;
  /** Dia do mês 1–28 (vencimento). */
  dueDay: number;
  /** Conta usada no pagamento da fatura. */
  paymentAccountId?: string;
  status: AccountStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = "open" | "closed" | "paid";

export interface CreditCardInvoice {
  id: string;
  creditCardId: string;
  /** Competência / ciclo: YYYY-MM do fechamento. */
  periodKey: string;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  /** Valor pago (se paid). */
  paidAmount?: number;
  paidAt?: string;
  paymentTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export type InstallmentChannel = "account" | "card";

/** Plano de parcelas (legado InstallmentExpense ou compra parcelada no cartão). */
export interface InstallmentPlan extends WithInstitution {
  id: string;
  name: string;
  installmentAmount: number;
  totalInstallments: number;
  startDate: string;
  categoryId?: string;
  channel: InstallmentChannel;
  accountId?: string;
  creditCardId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type RecurringKind = "income" | "expense";

/** Template de recorrência — não altera saldo até materializar ou entrar no fluxo projetado. */
export interface RecurringRule extends WithInstitution {
  id: string;
  kind: RecurringKind;
  name: string;
  amount: number;
  frequency: RecurrenceFrequency;
  /** Dia preferencial 1–28 (rendas/gastos mensais). */
  dayOfMonth?: number;
  categoryId?: string;
  accountId?: string;
  creditCardId?: string;
  /** income subtype legado. */
  incomeType?: "salary" | "vr" | "va" | "other";
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Posição de investimento (ativo). Aportes/resgates virão como Transaction na V2. */
export interface InvestmentPosition extends WithInstitution {
  id: string;
  name: string;
  amount: number;
  classification:
    | "renda_fixa"
    | "acoes"
    | "fiis"
    | "etfs"
    | "cripto"
    | "previdencia"
    | "poupanca"
    | "outro";
  categoryId?: string;
  accountId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoryKindLedger = CategoryKind;
