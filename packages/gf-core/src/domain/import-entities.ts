/**
 * Entidades de importação / conciliação persistidas no cofre (schema 5+).
 * Distinção crítica:
 * - Investment = entidade (o que existe)
 * - DatedInvestmentPosition = quanto existe em uma data
 * - Transaction / movement = o que aconteceu
 * - ImportedDocument = evidência
 */

export type InvestmentLifecycle = "active" | "closed" | "unknown";

/** Posição histórica de um investimento em uma data (nunca apagar automaticamente). */
export interface DatedInvestmentPosition {
  id: string;
  investmentId: string;
  /** ISO YYYY-MM-DD */
  date: string;
  value: number;
  sourceDocumentId?: string;
  /** Trecho curto de evidência (cofre cifrado); não logar. */
  evidenceText?: string;
  extractionMethod?: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

/** Alias confirmado pelo usuário para matching futuro. */
export interface InvestmentAlias {
  id: string;
  investmentId: string;
  rawName: string;
  normalizedName: string;
  createdAt: string;
}

/** Metadados do documento importado (sem conteúdo sensível em logs). */
export interface ImportedDocumentMeta {
  id: string;
  fileName: string;
  sourceKind: string;
  documentType: string;
  institutionId?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Hash do arquivo para deduplicar reimportação do mesmo binário. */
  contentFingerprint?: string;
  importedAt: string;
}

/** Resumo de período do extrato — NÃO vira lançamentos artificiais. */
export interface StatementSummary {
  id: string;
  documentId?: string;
  accountId?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  initialBalance: number | null;
  netIncome: number | null;
  totalCredits: number | null;
  totalDebits: number | null;
  finalBalance: number | null;
  mathOk?: boolean | null;
  createdAt: string;
}
