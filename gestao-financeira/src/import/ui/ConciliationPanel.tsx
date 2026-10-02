"use client";

import { formatBrl } from "@/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FinancialImportDraft } from "../types";
import type { ImportMatch, UserMatchDecision } from "../reconcile/types";
import {
  applyMatchDecision,
  type MatchDecisionInput,
} from "../reconcile/apply-decision";

function actionLabel(action: ImportMatch["action"]): string {
  switch (action) {
    case "NEW":
      return "Novo";
    case "UPDATE":
      return "Atualizar";
    case "UNCHANGED":
      return "Sem alteração";
    case "POSSIBLE_DUPLICATE":
      return "Possível duplicata";
    case "CONFLICT":
      return "Conflito";
    case "NEEDS_CONFIRMATION":
      return "Confirmar";
    case "IGNORE":
      return "Ignorar";
    default:
      return action;
  }
}

function MatchRow({
  match,
  onDecide,
}: {
  match: ImportMatch;
  onDecide: (input: MatchDecisionInput) => void;
}) {
  const needsAction =
    !match.userDecision &&
    (match.action === "NEEDS_CONFIRMATION" ||
      match.action === "CONFLICT" ||
      match.action === "POSSIBLE_DUPLICATE" ||
      (match.action === "NEW" && match.entityType === "investment"));

  return (
    <div className="grid gap-2 border-b border-border/40 py-3 text-sm last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{match.importedLabel}</p>
          <p className="text-xs text-muted-foreground">{match.reason}</p>
          {match.isMovementNotPosition ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Movimentação — não usar como saldo patrimonial.
            </p>
          ) : null}
          {match.userDecision ? (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              Decisão: {match.userDecision}
              {match.existingLabel ? ` → ${match.existingLabel}` : ""}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-block shrink-0 rounded px-2 py-0.5 text-xs font-medium",
            match.action === "CONFLICT" || match.action === "POSSIBLE_DUPLICATE"
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : match.action === "NEW"
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                : match.action === "NEEDS_CONFIRMATION"
                  ? "bg-sky-500/15 text-sky-800 dark:text-sky-300"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {actionLabel(match.action)} · {match.confidence}
        </span>
      </div>

      {(match.importedValue != null || match.existingValue != null) && (
        <p className="tabular-nums text-xs text-muted-foreground">
          {match.existingValue != null
            ? `Atual ${formatBrl(match.existingValue)} → `
            : ""}
          {match.importedValue != null
            ? `Importado ${formatBrl(match.importedValue)}`
            : "—"}
          {match.difference != null && Math.abs(match.difference) >= 0.005
            ? ` (Δ ${formatBrl(match.difference)})`
            : ""}
        </p>
      )}

      {needsAction ? (
        <div className="flex flex-wrap gap-2">
          {match.action === "CONFLICT" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onDecide({
                    matchId: match.id,
                    decision: "keep_existing",
                  })
                }
              >
                Manter atual
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  onDecide({
                    matchId: match.id,
                    decision: "use_imported",
                    saveAlias: true,
                  })
                }
              >
                Usar importado
              </Button>
            </>
          ) : null}

          {match.candidates?.map((c, idx) => (
            <Button
              key={c.entityId}
              type="button"
              size="sm"
              variant={idx === 0 ? "default" : "outline"}
              onClick={() =>
                onDecide({
                  matchId: match.id,
                  decision: "link_to",
                  linkToId: c.entityId,
                  saveAlias: true,
                })
              }
            >
              {idx + 1}. {c.label.slice(0, 40)}
              {c.label.length > 40 ? "…" : ""}
            </Button>
          ))}

          {match.action === "NEEDS_CONFIRMATION" ||
          match.action === "NEW" ||
          (match.candidates && match.candidates.length > 0) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onDecide({ matchId: match.id, decision: "create_new" })
              }
            >
              Novo investimento
            </Button>
          ) : null}

          {match.action === "POSSIBLE_DUPLICATE" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onDecide({
                  matchId: match.id,
                  decision: "accept_suggested",
                })
              }
            >
              É duplicata — ignorar
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onDecide({ matchId: match.id, decision: "ignore" })
            }
          >
            Ignorar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ConciliationPanel({
  draft,
  onDraftChange,
}: {
  draft: FinancialImportDraft;
  onDraftChange?: (next: FinancialImportDraft) => void;
}) {
  const rec = draft.reconciliation;
  if (!rec) return null;

  function decide(input: MatchDecisionInput) {
    if (!onDraftChange || !draft.reconciliation) return;
    const { reconciliation, pendingAlias } = applyMatchDecision(
      draft.reconciliation,
      input,
    );
    const pendingAliases = [...(draft.pendingAliases ?? [])];
    if (pendingAlias) {
      const exists = pendingAliases.some(
        (a) =>
          a.investmentId === pendingAlias.investmentId &&
          a.normalizedName === pendingAlias.normalizedName,
      );
      if (!exists) pendingAliases.push(pendingAlias);
    }
    let pendingClosures = [...(draft.pendingClosures ?? [])];
    if (input.decision === "mark_closed" && input.linkToId) {
      pendingClosures.push(input.linkToId);
    }
    onDraftChange({
      ...draft,
      reconciliation,
      pendingAliases,
      pendingClosures,
    });
  }

  function decideMissing(
    investmentId: string,
    decision: Extract<UserMatchDecision, "ignore" | "mark_closed">,
  ) {
    if (!onDraftChange) return;
    if (decision === "mark_closed") {
      onDraftChange({
        ...draft,
        pendingClosures: [
          ...new Set([...(draft.pendingClosures ?? []), investmentId]),
        ],
      });
    } else {
      onDraftChange({
        ...draft,
        pendingClosures: (draft.pendingClosures ?? []).filter(
          (id) => id !== investmentId,
        ),
      });
    }
  }

  const byType = (type: ImportMatch["entityType"]) =>
    rec.matches.filter((m) => m.entityType === type);

  const sections: { key: ImportMatch["entityType"]; title: string }[] = [
    { key: "investment", title: "Investimentos" },
    { key: "investment_position", title: "Posições" },
    { key: "investment_movement", title: "Movimentações" },
    { key: "transaction", title: "Transações" },
    { key: "account", title: "Contas" },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card/40 p-4">
      <div>
        <h3 className="font-heading text-lg font-medium">
          Conciliação da importação
        </h3>
        <p className="text-sm text-muted-foreground">
          {rec.summary.recognized} reconhecidos · {rec.summary.updates}{" "}
          atualizações · {rec.summary.created} novos ·{" "}
          {rec.summary.unchanged} sem alteração ·{" "}
          {rec.summary.possibleDuplicates} possíveis duplicatas ·{" "}
          {rec.summary.conflicts} conflitos · {rec.summary.needsConfirmation}{" "}
          precisam de confirmação
        </p>
      </div>

      {rec.mathChecks.map((check) => (
        <p
          key={check.label}
          className={cn(
            "text-sm",
            check.ok === false
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          {check.ok === true ? "✓ " : check.ok === false ? "⚠ " : ""}
          {check.detail}
        </p>
      ))}

      {sections.map((section) => {
        const items = byType(section.key);
        if (items.length === 0) return null;
        return (
          <div key={section.key}>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title} ({items.length})
            </h4>
            <div>
              {items.slice(0, 40).map((m) => (
                <MatchRow key={m.id} match={m} onDecide={decide} />
              ))}
              {items.length > 40 ? (
                <p className="text-xs text-muted-foreground">
                  +{items.length - 40} itens…
                </p>
              ) : null}
            </div>
          </div>
        );
      })}

      {rec.missingInvestments.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Não encontrados no documento
          </h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Não excluímos automaticamente. Possíveis motivos: resgate,
            vencimento, documento incompleto ou mudança de custódia.
          </p>
          {rec.missingInvestments.slice(0, 20).map((inv) => {
            const closed = (draft.pendingClosures ?? []).includes(
              inv.investmentId,
            );
            return (
              <div
                key={inv.investmentId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{inv.name}</span>
                  <span className="ml-2 tabular-nums text-muted-foreground">
                    {formatBrl(inv.amount)}
                  </span>
                  {closed ? (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                      Será marcado como encerrado
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => decideMissing(inv.investmentId, "ignore")}
                  >
                    Manter cadastro
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      decideMissing(inv.investmentId, "mark_closed")
                    }
                  >
                    Marcar encerrado
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
