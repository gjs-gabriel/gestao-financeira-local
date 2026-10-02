/**
 * Formato intermediário versionado da importação financeira.
 * Independente do layout do banco / PDF / OFX / CSV.
 */

export const INTERMEDIATE_SCHEMA_VERSION = "1.0" as const;

export type IntermediateDocumentType =
  | "BANK_STATEMENT"
  | "INCOME_REPORT"
  | "INVESTMENT_POSITION"
  | "INVESTMENT_STATEMENT"
  | "UNKNOWN";

export type IntermediateMovementKind =
  | "APPLICATION"
  | "REDEMPTION"
  | "INCOME"
  | "DIVIDEND"
  | "INTEREST"
  | "AMORTIZATION"
  | "FEE"
  | "TAX"
  | "OTHER";

export type IntermediateTxnKind =
  | "DEBIT"
  | "CREDIT"
  | "TRANSFER"
  | "APPLICATION"
  | "REDEMPTION"
  | "INCOME"
  | "UNKNOWN";

export interface IntermediateEvidence {
  document_id?: string;
  page?: number | null;
  text?: string;
  extraction_method?: string;
  confidence?: number;
}

export interface IntermediateAccount {
  temp_id: string;
  institution_name?: string;
  institution_id?: string;
  bank_id?: string;
  agency?: string | null;
  account_id?: string | null;
  account_digits?: string | null;
  label?: string;
  type?: "checking" | "savings" | "investment_cash" | "other";
  currency?: string;
  opening_balance?: number | null;
  closing_balance?: number | null;
  as_of?: string | null;
  evidence?: IntermediateEvidence;
}

export interface IntermediateTransaction {
  temp_id: string;
  account_temp_id?: string;
  kind: IntermediateTxnKind;
  /** Data da operação */
  transaction_date: string | null;
  posting_date?: string | null;
  settlement_date?: string | null;
  amount: number;
  /** Assinado: crédito positivo, débito negativo (quando aplicável). */
  signed_amount: number;
  raw_description: string;
  normalized_description?: string;
  fitid?: string;
  refnum?: string;
  checknum?: string;
  memo?: string;
  investment_temp_id?: string | null;
  relationship?: IntermediateMovementKind | null;
  evidence?: IntermediateEvidence;
}

export interface IntermediateInvestment {
  temp_id: string;
  raw_name: string;
  normalized_name: string;
  institution_id?: string;
  institution_name?: string;
  type_hint?: string;
  isin?: string;
  cnpj?: string;
  ticker?: string;
  external_id?: string;
  maturity_date?: string | null;
  evidence?: IntermediateEvidence;
}

/** POSIÇÃO — quanto existe em determinada data (não é movimentação). */
export interface IntermediateInvestmentPosition {
  temp_id: string;
  investment_temp_id: string;
  date: string;
  value: number;
  quantity?: number | null;
  evidence?: IntermediateEvidence;
}

/** MOVIMENTAÇÃO — o que aconteceu (não é saldo). */
export interface IntermediateInvestmentMovement {
  temp_id: string;
  investment_temp_id?: string | null;
  kind: IntermediateMovementKind;
  date: string;
  amount: number;
  signed_amount: number;
  raw_description: string;
  linked_transaction_temp_id?: string;
  evidence?: IntermediateEvidence;
}

export interface IntermediateIncome {
  temp_id: string;
  kind: "TAXABLE" | "EXEMPT" | "EXCLUSIVE" | "OTHER";
  year?: number | null;
  description: string;
  amount: number;
  institution_id?: string;
  evidence?: IntermediateEvidence;
}

export interface IntermediateStatementSummary {
  temp_id: string;
  account_temp_id?: string;
  period_start?: string | null;
  period_end?: string | null;
  initial_balance: number | null;
  net_income: number | null;
  total_credits: number | null;
  total_debits: number | null;
  final_balance: number | null;
  math_ok?: boolean | null;
  evidence?: IntermediateEvidence;
}

export interface FinancialImportIntermediate {
  schema_version: typeof INTERMEDIATE_SCHEMA_VERSION;
  source: {
    institution?: string | null;
    institution_id?: string | null;
    document_type: IntermediateDocumentType;
    original_filename: string;
    source_kind: "pdf" | "csv" | "xlsx" | "xls" | "ofx" | "unknown";
    period?: { start: string | null; end: string | null };
  };
  accounts: IntermediateAccount[];
  transactions: IntermediateTransaction[];
  investments: IntermediateInvestment[];
  investment_positions: IntermediateInvestmentPosition[];
  investment_movements: IntermediateInvestmentMovement[];
  income: IntermediateIncome[];
  statement_summaries: IntermediateStatementSummary[];
  warnings: string[];
}

export function emptyIntermediate(
  fileName: string,
  sourceKind: FinancialImportIntermediate["source"]["source_kind"] = "unknown",
): FinancialImportIntermediate {
  return {
    schema_version: INTERMEDIATE_SCHEMA_VERSION,
    source: {
      document_type: "UNKNOWN",
      original_filename: fileName,
      source_kind: sourceKind,
      period: { start: null, end: null },
    },
    accounts: [],
    transactions: [],
    investments: [],
    investment_positions: [],
    investment_movements: [],
    income: [],
    statement_summaries: [],
    warnings: [],
  };
}
