/**
 * Tipos do Import Wizard (Clips).
 * Draft NÃO é domínio financeiro — só candidatos à revisão.
 */

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

export type ImportSourceKind = "pdf" | "csv" | "xlsx" | "xls";

export type ImportTxnType =
  | "expense"
  | "income"
  | "transfer"
  | "investment"
  | "unknown";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ParsedDocumentRow {
  id: string;
  rawText: string;
  dateCandidate: string | null;
  amountCandidate: number | null;
  descriptionCandidate: string | null;
  typeHint?: ImportTxnType;
}

export interface ParsedDocument {
  documentType: "bank_statement" | "spreadsheet" | "unknown";
  sourceKind: ImportSourceKind;
  pages?: number;
  period: { start: string | null; end: string | null };
  openingBalance?: number | null;
  closingBalance?: number | null;
  rows: ParsedDocumentRow[];
  warnings: string[];
  /** Texto insuficiente (PDF imagem) */
  needsOcr?: boolean;
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
  documentInfo: {
    fileName: string;
    period: { start: string | null; end: string | null };
    pages?: number;
    openingBalance?: number | null;
    closingBalance?: number | null;
  };
  transactions: FinancialImportDraftTxn[];
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
  skippedDuplicates: number;
  skippedExcluded: number;
  importBatchId: string;
  count: number;
}

export interface ImportRollbackRef {
  batchId: string;
  userSessionId: string;
  createdIds: { expenses: string[]; incomes: string[] };
  importedAt: string;
}

export const IMPORTER_VERSION = "1.0.0";
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

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
