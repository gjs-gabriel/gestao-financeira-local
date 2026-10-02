/**
 * Aplica decisão humana sobre um ImportMatch.
 * Não grava no cofre — só atualiza o rascunho de conciliação.
 */

import { summarizeMatches, type ImportMatch, type UserMatchDecision } from "./types";
import type { ReconciliationResult } from "./types";
import { normalizeInvestmentName } from "../normalize/names";

export interface MatchDecisionInput {
  matchId: string;
  decision: UserMatchDecision;
  /** Quando decision = link_to */
  linkToId?: string;
  /** Salvar alias do nome importado → investimento escolhido */
  saveAlias?: boolean;
}

export interface PendingAlias {
  investmentId: string;
  rawName: string;
  normalizedName: string;
}

export function applyMatchDecision(
  reconciliation: ReconciliationResult,
  input: MatchDecisionInput,
): {
  reconciliation: ReconciliationResult;
  pendingAlias?: PendingAlias;
} {
  const matches = reconciliation.matches.map((m) => {
    if (m.id !== input.matchId) return m;
    return resolveMatch(m, input);
  });

  let pendingAlias: PendingAlias | undefined;
  const resolved = matches.find((m) => m.id === input.matchId);
  if (
    input.saveAlias &&
    resolved?.existingId &&
    (input.decision === "link_to" ||
      input.decision === "accept_suggested" ||
      input.decision === "use_imported")
  ) {
    pendingAlias = {
      investmentId: resolved.existingId,
      rawName: resolved.importedLabel,
      normalizedName: normalizeInvestmentName(resolved.importedLabel),
    };
  }

  return {
    reconciliation: {
      ...reconciliation,
      matches,
      summary: summarizeMatches(matches),
    },
    pendingAlias,
  };
}

function resolveMatch(
  match: ImportMatch,
  input: MatchDecisionInput,
): ImportMatch {
  const { decision, linkToId } = input;
  switch (decision) {
    case "ignore":
      return {
        ...match,
        action: "IGNORE",
        userDecision: decision,
        reason: "Ignorado pelo usuário",
      };
    case "create_new":
      return {
        ...match,
        action: "NEW",
        confidence: "HIGH",
        existingId: undefined,
        existingLabel: undefined,
        userDecision: decision,
        reason: "Usuário confirmou novo investimento",
      };
    case "keep_existing":
      return {
        ...match,
        action: "UNCHANGED",
        userDecision: decision,
        reason: "Usuário manteve valor cadastrado",
      };
    case "use_imported":
      return {
        ...match,
        action: "UPDATE",
        userDecision: decision,
        reason: "Usuário escolheu valor importado",
      };
    case "mark_closed":
      return {
        ...match,
        action: "IGNORE",
        userDecision: decision,
        reason: "Marcado como encerrado (não excluir histórico)",
      };
    case "link_to": {
      const candidate = match.candidates?.find((c) => c.entityId === linkToId);
      return {
        ...match,
        action: match.entityType === "investment_position" ? "UPDATE" : "UNCHANGED",
        confidence: "HIGH",
        existingId: linkToId,
        existingLabel: candidate?.label ?? match.existingLabel,
        linkToId,
        userDecision: decision,
        reason: `Vinculado manualmente a ${candidate?.label ?? linkToId}`,
      };
    }
    case "accept_suggested":
      return {
        ...match,
        action:
          match.entityType === "investment_position" &&
          match.existingValue != null &&
          match.importedValue != null &&
          Math.abs((match.importedValue ?? 0) - (match.existingValue ?? 0)) >=
            0.005
            ? "UPDATE"
            : match.action === "NEEDS_CONFIRMATION"
              ? "UNCHANGED"
              : match.action === "POSSIBLE_DUPLICATE"
                ? "IGNORE"
                : match.action,
        confidence: match.existingId ? "HIGH" : match.confidence,
        userDecision: decision,
        reason: "Sugestão aceita pelo usuário",
      };
    default:
      return { ...match, userDecision: decision };
  }
}

/** Filtra matches que ainda bloqueiam confirmação automática. */
export function unresolvedConfirmationCount(
  reconciliation: ReconciliationResult | undefined,
): number {
  if (!reconciliation) return 0;
  return reconciliation.matches.filter(
    (m) =>
      (m.action === "NEEDS_CONFIRMATION" || m.action === "CONFLICT") &&
      !m.userDecision,
  ).length;
}
