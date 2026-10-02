import { createId } from "@/domain/snapshot";
import type { VaultSnapshot } from "@/domain/types";
import type { FinancialImportIntermediate } from "../schema/intermediate";
import { matchAccounts } from "./match-accounts";
import { matchInvestments, matchPositions } from "./match-investments";
import { matchTransactions } from "./match-transactions";
import { validateStatementMath } from "./statement-math";
import {
  summarizeMatches,
  type ImportMatch,
  type ReconciliationResult,
} from "./types";

/**
 * Motor de conciliação: compara intermediário × cofre.
 * Nunca grava — só produz ImportMatch para revisão humana.
 */
export function reconcileImport(input: {
  intermediate: FinancialImportIntermediate;
  snapshot: VaultSnapshot;
}): ReconciliationResult {
  const { intermediate, snapshot } = input;

  const investmentMatches = matchInvestments({
    snapshot,
    investments: intermediate.investments,
  });

  const positionMatches = matchPositions({
    snapshot,
    positions: intermediate.investment_positions,
    investmentMatches,
  });

  const accountMatches = matchAccounts({
    snapshot,
    accounts: intermediate.accounts,
  });

  const transactionMatches = matchTransactions({
    snapshot,
    transactions: intermediate.transactions,
  });

  const movementMatches: ImportMatch[] = intermediate.investment_movements.map(
    (mov) => ({
      id: createId("match"),
      entityType: "investment_movement" as const,
      action: "NEW" as const,
      confidence: "HIGH" as const,
      importedTempId: mov.temp_id,
      importedLabel: mov.raw_description,
      importedValue: mov.amount,
      date: mov.date,
      isMovementNotPosition: true,
      reason: `${mov.kind}: valor de movimentação — não usar como posição patrimonial`,
    }),
  );

  const matches: ImportMatch[] = [
    ...accountMatches,
    ...investmentMatches,
    ...positionMatches,
    ...transactionMatches,
    ...movementMatches,
  ];

  const seenInvestmentIds = new Set(
    investmentMatches.map((m) => m.existingId).filter(Boolean) as string[],
  );
  const missingInvestments =
    intermediate.investment_positions.length > 0 ||
    intermediate.investments.length > 0
      ? snapshot.investments
          .filter(
            (inv) =>
              (inv.lifecycle ?? "active") !== "closed" &&
              !seenInvestmentIds.has(inv.id),
          )
          .map((inv) => ({
            investmentId: inv.id,
            name: inv.name,
            amount: inv.amount,
          }))
      : [];

  const mathChecks = intermediate.statement_summaries.map((sum) => {
    const check = validateStatementMath({
      initialBalance: sum.initial_balance,
      totalCredits: sum.total_credits,
      totalDebits: sum.total_debits,
      netIncome: sum.net_income,
      finalBalance: sum.final_balance,
    });
    return {
      label: `Resumo ${sum.period_start ?? "?"} → ${sum.period_end ?? "?"}`,
      ok: check.ok,
      detail: check.detail,
    };
  });

  return {
    matches,
    summary: summarizeMatches(matches),
    missingInvestments,
    mathChecks,
  };
}
