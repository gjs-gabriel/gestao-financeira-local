import type {
  Account,
  CreditCard,
  CreditCardInvoice,
  InstallmentPlan,
  InvestmentPosition,
  RecurringRule,
  Transaction,
} from "./ledger-types";
import type { Budget, CategorizationRule, WealthSnapshot } from "./v15-types";

/**
 * Domínio portável — tipos puros, sem React/DOM/IndexedDB.
 * Valores monetários: número decimal em BRL (ex.: 1500.50 = R$ 1.500,50).
 * Datas: strings ISO 8601 (YYYY-MM-DD ou timestamp completo).
 *
 * Schema 4 introduz o ledger (Account + Transaction). Listas legadas
 * (incomes, oneTimeExpenses, …) permanecem até a Fase 2 reescrever a UI.
 */

export type IncomeType = "salary" | "vr" | "va" | "other";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type CategoryKind = "income" | "investment" | "expense" | "general";

export type InvestmentClass =
  | "renda_fixa"
  | "acoes"
  | "fiis"
  | "etfs"
  | "cripto"
  | "previdencia"
  | "poupanca"
  | "outro";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color?: string;
  createdAt: string;
}

export interface Institution {
  id: string;
  name: string;
  createdAt: string;
}

/** Campos comuns de instituição em lançamentos. */
export interface WithInstitution {
  /** Id do seed ou custom (ver snapshot.institutions / customInstitutions). */
  institutionId?: string;
  /** Nome livre quando institutionId = inst-outro. */
  institutionOther?: string;
}

export interface Income extends WithInstitution {
  id: string;
  type: IncomeType;
  name: string;
  /** Valor mensal em BRL */
  amount: number;
  dayOfMonth?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Investment extends WithInstitution {
  id: string;
  name: string;
  /** Saldo atual em BRL */
  amount: number;
  classification: InvestmentClass;
  categoryId?: string;
  /**
   * @deprecated use institutionId — texto livre legado, migrado no parse.
   */
  institution?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpense extends WithInstitution {
  id: string;
  name: string;
  amount: number;
  frequency: RecurrenceFrequency;
  categoryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Compra dividida em parcelas mensais iguais. */
export interface InstallmentExpense extends WithInstitution {
  id: string;
  name: string;
  /** Valor de cada parcela em BRL */
  installmentAmount: number;
  /** Quantidade de parcelas (mínimo 2) */
  totalInstallments: number;
  /** Data da primeira parcela, ISO YYYY-MM-DD */
  startDate: string;
  categoryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OneTimeExpense extends WithInstitution {
  id: string;
  name: string;
  amount: number;
  /** Data ISO YYYY-MM-DD */
  date: string;
  categoryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Crédito pontual (ex.: importação de extrato bancário). */
export interface OneTimeIncome extends WithInstitution {
  id: string;
  name: string;
  amount: number;
  /** Data ISO YYYY-MM-DD */
  date: string;
  categoryId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Debt {
  id: string;
  name: string;
  /** Saldo devedor em BRL */
  balance: number;
  /** Valor original (opcional) */
  originalAmount?: number;
  /** Parcela mensal (opcional) */
  installmentAmount?: number;
  /** Parcelas restantes (opcional) */
  remainingInstallments?: number;
  /** Taxa de juros anual (%) opcional */
  interestRate?: number;
  /** Data de vencimento ISO YYYY-MM-DD */
  dueDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Snapshot em claro do cofre (serializado dentro do envelope cifrado). */
export interface VaultSnapshot {
  /**
   * Versão do schema do snapshot.
   * 1 = MVP; 2 = instituições; 3 = parcelas; 4 = ledger (contas/transações/cartões).
   * parseSnapshot aceita 1–4 e normaliza para a versão atual.
   */
  schemaVersion: 1 | 2 | 3 | 4;
  updatedAt: string;
  /** --- Legado (UI atual / projeção) --- */
  incomes: Income[];
  oneTimeIncomes: OneTimeIncome[];
  investments: Investment[];
  recurringExpenses: RecurringExpense[];
  oneTimeExpenses: OneTimeExpense[];
  installmentExpenses: InstallmentExpense[];
  debts: Debt[];
  goals: Goal[];
  categories: Category[];
  institutions: Institution[];
  /** --- Ledger V1.5 (fonte futura) --- */
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  invoices: CreditCardInvoice[];
  installmentPlans: InstallmentPlan[];
  recurringRules: RecurringRule[];
  investmentPositions: InvestmentPosition[];
  budgets: Budget[];
  categorizationRules: CategorizationRule[];
  /** Histórico mensal de patrimônio (V2). */
  wealthHistory: WealthSnapshot[];
}

/** Envelope versionado do arquivo .gfin — contrato estável web ↔ app futuro. */
export interface GfinEnvelope {
  format: "gfin";
  /** Versão do formato do arquivo. */
  version: 1;
  kdf: {
    algorithm: "PBKDF2";
    iterations: number;
    hash: "SHA-256";
    salt: string; // base64
  };
  cipher: {
    algorithm: "AES-GCM";
    iv: string; // base64
  };
  ciphertext: string; // base64
  createdAt: string;
}

export const GFIN_FORMAT_VERSION = 1 as const;
/** Schema atual do snapshot em claro (dentro do envelope). */
export const SNAPSHOT_SCHEMA_VERSION = 4 as const;
export const PBKDF2_ITERATIONS = 310_000;
