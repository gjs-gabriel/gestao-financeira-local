/** DTOs espelhando a API Pluggy (subset usado pelo app). */

export type PluggyAccountType = "BANK" | "CREDIT";

export type PluggyAccountSubtype =
  | "CHECKING_ACCOUNT"
  | "SAVINGS_ACCOUNT"
  | "CREDIT_CARD"
  | string;

export interface PluggyBankData {
  transferNumber?: string | null;
  closingBalance?: number | null;
  automaticallyInvestedBalance?: number | null;
}

export interface PluggyCreditData {
  level?: string | null;
  brand?: string | null;
  balanceCloseDate?: string | null;
  balanceDueDate?: string | null;
  availableCreditLimit?: number | null;
  creditLimit?: number | null;
  minimumPayment?: number | null;
  status?: string | null;
}

export interface PluggyAccount {
  id: string;
  type: PluggyAccountType;
  subtype: PluggyAccountSubtype;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  currencyCode: string;
  itemId: string;
  owner?: string | null;
  bankData?: PluggyBankData | null;
  creditData?: PluggyCreditData | null;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  currencyCode?: string;
  category?: string | null;
  categoryId?: string | null;
  type?: "DEBIT" | "CREDIT" | string | null;
  status?: "PENDING" | "POSTED" | string | null;
  paymentData?: unknown;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    totalAmount?: number | null;
    billId?: string | null;
  } | null;
  /** Campos flat que alguns conectores devolvem na raiz. */
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  billId?: string | null;
}

export interface PluggyInvestment {
  id: string;
  itemId: string;
  name: string;
  type?: string | null;
  subtype?: string | null;
  balance: number;
  currencyCode?: string;
  code?: string | null;
  isin?: string | null;
  amount?: number | null;
  quantity?: number | null;
  value?: number | null;
  status?: string | null;
}

export interface PluggyBillPayment {
  id: string;
  valueType?: string | null;
  paymentDate?: string | null;
  paymentMode?: string | null;
  amount: number;
  currencyCode?: string;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount: number;
  totalAmountCurrencyCode?: string;
  minimumPaymentAmount?: number | null;
  allowsInstallments?: boolean | null;
  payments?: PluggyBillPayment[];
  /** Presente em algumas respostas / filtros por conta. */
  accountId?: string | null;
}

export interface PluggyLoan {
  id: string;
  itemId?: string;
  contractNumber?: string | null;
  type?: string | null;
  productName?: string | null;
  balance?: number | null;
  currencyCode?: string;
  installmentDueDate?: string | null;
  installmentAmount?: number | null;
  interestRate?: number | null;
  outstandingBalance?: number | null;
}

export interface PluggyPage<T> {
  total: number;
  totalPages: number;
  page: number;
  results: T[];
}

export interface PluggyItemBundle {
  itemId: string;
  accounts: PluggyAccount[];
  transactions: PluggyTransaction[];
  investments: PluggyInvestment[];
  bills: PluggyBill[];
  loans: PluggyLoan[];
}

/** Aviso não-fatal durante o pull (produto ausente, conta sem extrato, etc.). */
export interface PluggyFetchWarning {
  level: "warn" | "info";
  itemId?: string;
  accountId?: string;
  accountName?: string;
  code?: string;
  message: string;
}

export interface PluggyFetchBundle {
  fetchedAt: string;
  items: PluggyItemBundle[];
  warnings?: PluggyFetchWarning[];
}

export class PluggyHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = "PluggyHttpError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}
