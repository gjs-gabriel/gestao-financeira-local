/**
 * Tipos da conciliação — cada item importado vira um ImportMatch.
 */

export type MatchAction =
  | "NEW"
  | "UPDATE"
  | "UNCHANGED"
  | "POSSIBLE_DUPLICATE"
  | "CONFLICT"
  | "IGNORE"
  | "NEEDS_CONFIRMATION";

export type MatchConfidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type MatchEntityType =
  | "account"
  | "transaction"
  | "investment"
  | "investment_position"
  | "investment_movement"
  | "income"
  | "statement_summary";

export type UserMatchDecision =
  | "accept_suggested"
  | "keep_existing"
  | "use_imported"
  | "create_new"
  | "ignore"
  | "link_to"
  | "mark_closed";

export interface ImportMatchCandidate {
  entityId: string;
  label: string;
  score: number;
  detail?: string;
}

export interface ImportMatch {
  id: string;
  entityType: MatchEntityType;
  action: MatchAction;
  confidence: MatchConfidence;
  /** Id temporário no formato intermediário. */
  importedTempId: string;
  /** Id da entidade existente no cofre, se houver. */
  existingId?: string;
  importedLabel: string;
  existingLabel?: string;
  importedValue?: number | null;
  existingValue?: number | null;
  difference?: number | null;
  date?: string | null;
  reason: string;
  /** Valor da movimentação NÃO é patrimônio — aviso explícito. */
  isMovementNotPosition?: boolean;
  candidates?: ImportMatchCandidate[];
  userDecision?: UserMatchDecision;
  linkToId?: string;
  /** Evidência curta para UI (não logar em produção). */
  evidenceText?: string;
}

export interface ReconciliationSummary {
  recognized: number;
  updates: number;
  created: number;
  unchanged: number;
  possibleDuplicates: number;
  conflicts: number;
  needsConfirmation: number;
  ignored: number;
}

export interface ReconciliationResult {
  matches: ImportMatch[];
  summary: ReconciliationSummary;
  /** Investimentos do cofre que não apareceram no documento. */
  missingInvestments: {
    investmentId: string;
    name: string;
    amount: number;
  }[];
  mathChecks: {
    label: string;
    ok: boolean | null;
    detail: string;
  }[];
}

export function summarizeMatches(matches: ImportMatch[]): ReconciliationSummary {
  const summary: ReconciliationSummary = {
    recognized: 0,
    updates: 0,
    created: 0,
    unchanged: 0,
    possibleDuplicates: 0,
    conflicts: 0,
    needsConfirmation: 0,
    ignored: 0,
  };
  for (const m of matches) {
    if (m.existingId) summary.recognized += 1;
    switch (m.action) {
      case "UPDATE":
        summary.updates += 1;
        break;
      case "NEW":
        summary.created += 1;
        break;
      case "UNCHANGED":
        summary.unchanged += 1;
        break;
      case "POSSIBLE_DUPLICATE":
        summary.possibleDuplicates += 1;
        break;
      case "CONFLICT":
        summary.conflicts += 1;
        break;
      case "NEEDS_CONFIRMATION":
        summary.needsConfirmation += 1;
        break;
      case "IGNORE":
        summary.ignored += 1;
        break;
    }
  }
  return summary;
}
