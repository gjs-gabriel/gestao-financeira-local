/**
 * Confirmation Gate + commit atômico + rollback.
 * ÚNICO caminho que pode modificar o cofre a partir do wizard.
 */

import {
  applyImportDraft,
  type ImportDraftRow,
  type ImportRowKind,
} from "@/domain/import";
import { removeEntity, upsertEntity, createId } from "@/domain/snapshot";
import { removeInvestmentSynced, upsertInvestmentSynced } from "@/domain/sync";
import type { VaultSnapshot } from "@/domain/types";
import {
  accountIdMap,
  applyHoldingSnapshots,
  applyInvestmentMovements,
  ensureImportedAccounts,
  reconcileImportedAccounts,
} from "./apply-document-balances";
import { applyReconciliationSideEffects } from "./apply-reconciliation";
import {
  ImportConfirmationRequiredError,
  ImportSessionInvalidError,
  type FinancialImportDraft,
  type ImportCommitConfirmation,
  type ImportCommitResult,
  type ImportRollbackRef,
} from "../types";
import {
  draftCanProceedToConfirm,
  validateImportDraft,
} from "../validation/ImportValidationEngine";

function toDomainRows(
  draft: FinancialImportDraft,
  selectedIds: string[],
  accountId?: string,
): ImportDraftRow[] {
  const selected = new Set(selectedIds);
  return draft.transactions
    .filter((t) => selected.has(t.id) && t.include)
    .filter((t) => t.type === "expense" || t.type === "income")
    .map((t, rowIndex) => {
      const kind: ImportRowKind = t.type === "income" ? "income" : "expense";
      return {
        rowIndex,
        date: t.date,
        description: t.description,
        amount: t.amount,
        kind,
        categoryId: t.categoryId,
        institutionId: t.institutionId ?? draft.institution?.institutionId,
        institutionOther: t.institutionOther,
        accountId,
        include: true,
        duplicate: t.duplicate,
      };
    });
}

/**
 * commitImport — exige confirmação explícita.
 * Nunca chamar a partir do parser ou da IA.
 */
export function commitImport(input: {
  draft: FinancialImportDraft;
  snapshot: VaultSnapshot;
  confirmation: ImportCommitConfirmation;
  activeUserSessionId: string;
  vaultUnlocked: boolean;
}): {
  snapshot: VaultSnapshot;
  result: ImportCommitResult;
  rollback: ImportRollbackRef;
} {
  const {
    draft,
    snapshot,
    confirmation,
    activeUserSessionId,
    vaultUnlocked,
  } = input;

  if (!vaultUnlocked) {
    throw new ImportConfirmationRequiredError("Cofre bloqueado.");
  }
  if (!confirmation?.confirmed || !confirmation.checkboxChecked) {
    throw new ImportConfirmationRequiredError();
  }
  if (draft.userSessionId !== activeUserSessionId) {
    throw new ImportSessionInvalidError(
      "O rascunho não pertence ao usuário atual.",
    );
  }
  if (draft.status === "discarded" || draft.status === "committed") {
    throw new ImportSessionInvalidError("Rascunho inválido.");
  }

  const validation = validateImportDraft(draft);
  if (validation.blockingErrors > 0 || !draftCanProceedToConfirm(draft)) {
    throw new ImportConfirmationRequiredError(
      "Corrija os erros antes de importar.",
    );
  }

  const includedAccounts = (draft.accountSnapshots ?? []).filter(
    (account) => account.include,
  );
  const includedHoldings = (draft.holdings ?? []).filter(
    (holding) => holding.include,
  );
  const selected = new Set(confirmation.selectedIds);
  const investmentRows = draft.transactions.filter(
    (tx) =>
      selected.has(tx.id) &&
      tx.include &&
      tx.type === "investment",
  );
  const cashPreview = toDomainRows(draft, confirmation.selectedIds);
  if (
    cashPreview.length === 0 &&
    investmentRows.length === 0 &&
    includedAccounts.length === 0 &&
    includedHoldings.length === 0
  ) {
    throw new ImportConfirmationRequiredError(
      "Selecione ao menos um lançamento, conta ou aplicação.",
    );
  }

  const beforeExpenseIds = new Set(snapshot.oneTimeExpenses.map((e) => e.id));
  const beforeIncomeIds = new Set(
    (snapshot.oneTimeIncomes ?? []).map((e) => e.id),
  );

  const ensured = ensureImportedAccounts(snapshot, includedAccounts);
  const ids = accountIdMap(
    snapshot,
    ensured.snapshot,
    includedAccounts,
  );
  const rows = toDomainRows(
    draft,
    confirmation.selectedIds,
    ensured.primaryAccountId,
  );
  const applied =
    rows.length > 0
      ? applyImportDraft(ensured.snapshot, rows)
      : {
          snapshot: ensured.snapshot,
          addedExpenses: 0,
          addedIncomes: 0,
          skippedDuplicates: 0,
          skippedExcluded: 0,
        };

  let   next = applyInvestmentMovements(
    applied.snapshot,
    investmentRows.map((tx) => ({
      date: tx.date,
      amount: tx.amount,
      signedAmount: tx.signedAmount,
      description: tx.description,
      holdingName: tx.holdingName,
      institutionId: tx.institutionId ?? draft.institution?.institutionId,
      institutionOther: tx.institutionOther,
      duplicate: tx.duplicate,
      include: tx.include,
    })),
    ensured.primaryAccountId,
    ensured,
  );

  // Respeitar decisões de conflito de posição (manter atual vs usar importado)
  const holdingsForCommit = includedHoldings.filter((holding) => {
    const match = draft.reconciliation?.matches.find(
      (m) =>
        m.entityType === "investment_position" &&
        (m.importedTempId === holding.id ||
          m.importedLabel === holding.name),
    );
    if (!match) return true;
    if (match.userDecision === "keep_existing" || match.userDecision === "ignore") {
      return false;
    }
    if (match.action === "IGNORE") return false;
    return true;
  });

  next = applyHoldingSnapshots(next, holdingsForCommit, ensured);
  next = reconcileImportedAccounts(next, includedAccounts, ids, ensured);
  next = applyReconciliationSideEffects(next, draft);

  const createdExpenses = next.oneTimeExpenses
    .filter((e) => !beforeExpenseIds.has(e.id))
    .map((e) => e.id);
  const createdIncomes = (next.oneTimeIncomes ?? [])
    .filter((e) => !beforeIncomeIds.has(e.id))
    .map((e) => e.id);

  const batchId = createId("ibatch");
  const result: ImportCommitResult = {
    ok: true,
    addedExpenses: applied.addedExpenses,
    addedIncomes: applied.addedIncomes,
    addedAccounts: ensured.addedAccounts,
    updatedAccounts: ensured.updatedAccounts,
    addedInvestments: ensured.addedInvestments,
    updatedInvestments: ensured.updatedInvestments,
    skippedDuplicates: applied.skippedDuplicates,
    skippedExcluded: applied.skippedExcluded,
    importBatchId: batchId,
    count:
      applied.addedExpenses +
      applied.addedIncomes +
      ensured.addedAccounts +
      ensured.updatedAccounts +
      ensured.addedInvestments +
      ensured.updatedInvestments,
  };

  const rollback: ImportRollbackRef = {
    batchId,
    userSessionId: activeUserSessionId,
    createdIds: {
      expenses: createdExpenses,
      incomes: createdIncomes,
      transactions: ensured.createdTransactionIds,
      accounts: ensured.createdAccountIds,
      investments: ensured.createdInvestmentIds,
    },
    previousAccounts: ensured.previousAccounts,
    previousInvestments: ensured.previousInvestments,
    importedAt: new Date().toISOString(),
  };

  return { snapshot: next, result, rollback };
}

export function rollbackImport(
  snapshot: VaultSnapshot,
  ref: ImportRollbackRef,
  activeUserSessionId: string,
): VaultSnapshot {
  if (ref.userSessionId !== activeUserSessionId) {
    throw new ImportSessionInvalidError();
  }
  const expenseSet = new Set(ref.createdIds.expenses);
  const incomeSet = new Set(ref.createdIds.incomes);
  const txIds = new Set([
    ...(ref.createdIds.transactions ?? []),
    ...ref.createdIds.expenses.map((id) =>
      id.startsWith("tx_") ? id : `tx_${id}`,
    ),
    ...ref.createdIds.incomes.map((id) =>
      id.startsWith("tx_") ? id : `tx_${id}`,
    ),
  ]);
  let next: VaultSnapshot = {
    ...snapshot,
    oneTimeExpenses: snapshot.oneTimeExpenses.filter(
      (e) => !expenseSet.has(e.id),
    ),
    oneTimeIncomes: (snapshot.oneTimeIncomes ?? []).filter(
      (e) => !incomeSet.has(e.id),
    ),
    transactions: (snapshot.transactions ?? []).filter(
      (tx) => !txIds.has(tx.id),
    ),
    updatedAt: new Date().toISOString(),
  };
  for (const id of ref.createdIds.investments ?? []) {
    next = removeInvestmentSynced(next, id);
  }
  for (const item of ref.previousInvestments ?? []) {
    next = upsertInvestmentSynced(next, item);
  }
  for (const id of ref.createdIds.accounts ?? []) {
    next = removeEntity(next, "accounts", id);
  }
  for (const account of ref.previousAccounts ?? []) {
    next = upsertEntity(next, "accounts", account);
  }
  return next;
}

/** Exporta draft revisado como CSV (não importa). */
export function exportDraftCsv(draft: FinancialImportDraft): string {
  const header = "date,description,amount,type,category,institution";
  const lines = draft.transactions
    .filter((t) => t.include)
    .map((t) => {
      const amount =
        t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : t.signedAmount;
      const cat = (t.categoryLabel ?? "").replace(/,/g, " ");
      const inst = (t.institutionOther ?? "").replace(/,/g, " ");
      const desc = t.description.replace(/,/g, " ").replace(/\n/g, " ");
      return `${t.date},${desc},${amount},${t.type},${cat},${inst}`;
    });
  return [header, ...lines].join("\n");
}
