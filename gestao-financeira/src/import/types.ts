/**
 * Tipos do Import Wizard (Clips).
 * Draft NÃO é domínio financeiro — só candidatos à revisão.
 */

import type { Account } from "@/domain/ledger-types";
import type { Investment, InvestmentClass } from "@/domain/types";
import type { FinancialImportIntermediate } from "./schema/intermediate";
import type { ReconciliationResult } from "./reconcile/types";

export type ImportWizardPhase =
  | "idle"
  | "selecting"
  | "processing"
  | "parsed"
  | "analyzing"
  | "draft"
  | "review"
  | "validation"
  | "ready"
  | "importing"
  | "completed"
  | "error"
  | "ocr_required";

export type ImportVisualStep =
  | "document"
  | "analysis"
  | "review"
  | "confirm"
  | "done";

export type ImportSourceKind = "pdf" | "csv" | "xlsx" | "xls" | "ofx";

export type ImportDocumentType =
  | "bank_statement"
  | "income_report"
  | "spreadsheet"
  | "unknown";

export type ImportTxnType =
  | "expense"
  | "income"
  | "transfer"
  | "investment"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low";

/** Reexport — fonte única em security/limits. */
export { MAX_FILE_BYTES } from "@/security/limits";

export interface ParsedDocumentRow {
  id: string;
  rawText: string;
  dateCandidate: string | null;
  amountCandidate: number | null;
  descriptionCandidate: string | null;
  typeHint?: ImportTxnType;
  /** Nome da aplicação quando o lançamento é aporte ou resgate. */
  holdingName?: string | null;
}

export interface ImportInstitutionInfo {
  institutionId: string;
  institutionName: string;
}

/** Saldo de conta encontrado no extrato ou no informe. */
export interface ImportAccountSnapshot {
  id: string;
  institutionId: string;
  institutionName: string;
  agency: string | null;
  /** Exibição, por exemplo 1234567-8. */
  accountNumber: string | null;
  /** Dígitos usados para reencontrar a conta. */
  accountDigits: string | null;
  label: string;
  accountType: "checking" | "savings" | "investment_cash";
  openingBalance: number | null;
  closingBalance: number;
  /** ISO YYYY-MM-DD do saldo final ou de 31/12. */
  asOf: string;
  periodStart: string | null;
  /** statement: saldo inicial + movimentos; snapshot: valor do informe. */
  balanceMode: "statement" | "snapshot";
  include: boolean;
}

/** Posição de investimento encontrada no documento. */
export interface ImportHoldingSnapshot {
  id: string;
  institutionId: string;
  institutionName: string;
  name: string;
  amount: number;
  asOf: string;
  classification: InvestmentClass;
  /** snapshot substitui o saldo; delta soma um aporte ou resgate. */
  mode: "snapshot" | "delta";
  notes?: string;
  include: boolean;
}

export interface ParsedDocument {
  documentType: ImportDocumentType;
  sourceKind: ImportSourceKind;
  pages?: number;
  period: { start: string | null; end: string | null };
  openingBalance?: number | null;
  closingBalance?: number | null;
  institution?: ImportInstitutionInfo | null;
  accounts?: ImportAccountSnapshot[];
  holdings?: ImportHoldingSnapshot[];
  rows: ParsedDocumentRow[];
  warnings: string[];
  /** Texto insuficiente (PDF imagem) — OCR local pode ser tentado. */
  needsOcr?: boolean;
  /** CSV precisa de mapeamento manual de colunas. */
  csvMappingRequired?: {
    headers: string[];
    suggested: Record<string, string>;
    /** Texto bruto só em memória — não persistir. */
    rawText: string;
  };
}

export interface AIImportSuggestion {
  sourceRowId: string;
  date: string | null;
  description: string;
  amount: number | null;
  type: ImportTxnType;
  categorySuggestion: string | null;
  categoryIdSuggestion?: string;
  institutionSuggestion?: string | null;
  confidence: number;
  notes?: string;
}

export interface AIImportResult {
  transactions: AIImportSuggestion[];
  usedAI: boolean;
}

export type DraftRowStatus =
  | "pending"
  | "ready"
  | "needs_attention"
  | "ignored"
  | "error";

export interface FinancialImportDraftTxn {
  id: string;
  sourceRowId: string;
  date: string;
  description: string;
  amount: number;
  /** signed: negative expense convention for display; abs stored for domain */
  signedAmount: number;
  type: ImportTxnType;
  categoryId?: string;
  categoryLabel?: string;
  institutionId?: string;
  institutionOther?: string;
  holdingName?: string | null;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  status: DraftRowStatus;
  include: boolean;
  duplicate: boolean;
  duplicateReason?: string;
  errors: string[];
  warnings: string[];
}

export interface FinancialImportDraft {
  id: string;
  /** Isolamento — draft só vale para esta sessão de usuário */
  userSessionId: string;
  source: ImportSourceKind;
  documentType: ImportDocumentType;
  institution?: ImportInstitutionInfo | null;
  accountSnapshots: ImportAccountSnapshot[];
  holdings: ImportHoldingSnapshot[];
  documentInfo: {
    fileName: string;
    period: { start: string | null; end: string | null };
    pages?: number;
    openingBalance?: number | null;
    closingBalance?: number | null;
  };
  transactions: FinancialImportDraftTxn[];
  /** Formato intermediário versionado (conciliação). */
  intermediate?: FinancialImportIntermediate;
  /** Resultado da conciliação com o cofre — revisão antes do commit. */
  reconciliation?: ReconciliationResult;
  /** Aliases a persistir no commit (após confirmação manual). */
  pendingAliases?: {
    investmentId: string;
    rawName: string;
    normalizedName: string;
  }[];
  /** Investimentos a marcar como encerrados (não apagar). */
  pendingClosures?: string[];
  validation: ImportValidationResult;
  status: "draft" | "ready" | "committed" | "discarded";
  createdAt: string;
  importerVersion: string;
}

export interface ImportValidationResult {
  errors: string[];
  warnings: string[];
  balanceCheck: {
    applicable: boolean;
    expected?: number;
    reported?: number;
    ok?: boolean;
  };
  blockingErrors: number;
  attentionCount: number;
  readyCount: number;
}

export interface ImportCommitConfirmation {
  confirmed: true;
  checkboxChecked: true;
  selectedIds: string[];
  userSessionId: string;
}

export interface ImportCommitResult {
  ok: true;
  addedExpenses: number;
  addedIncomes: number;
  addedAccounts: number;
  updatedAccounts: number;
  addedInvestments: number;
  updatedInvestments: number;
  skippedDuplicates: number;
  skippedExcluded: number;
  importBatchId: string;
  count: number;
}

export interface ImportRollbackRef {
  batchId: string;
  userSessionId: string;
  createdIds: {
    expenses: string[];
    incomes: string[];
    transactions?: string[];
    accounts?: string[];
    investments?: string[];
  };
  /** Contas que já existiam e tiveram saldo alterado. */
  previousAccounts?: Account[];
  /** Aplicações que já existiam e tiveram saldo alterado. */
  previousInvestments?: Investment[];
  importedAt: string;
}

export class ImportPasswordRequiredError extends Error {
  readonly incorrect: boolean;
  constructor(incorrect = false) {
    super(
      incorrect
        ? "Senha incorreta. Tente novamente."
        : "Este PDF está protegido por senha.",
    );
    this.name = "ImportPasswordRequiredError";
    this.incorrect = incorrect;
  }
}

export const IMPORTER_VERSION = "2.0.0";

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

export class ImportConfirmationRequiredError extends Error {
  constructor(message = "Confirmação explícita obrigatória para importar.") {
    super(message);
    this.name = "ImportConfirmationRequiredError";
  }
}

export class ImportSessionInvalidError extends Error {
  constructor(message = "Sessão de importação inválida ou expirada.") {
    super(message);
    this.name = "ImportSessionInvalidError";
  }
}
