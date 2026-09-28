/**
 * Confirmation Gate + commit atômico + rollback.
 * ÚNICO caminho que pode modificar o cofre a partir do wizard.
 */

import {
  applyImportDraft,
  type ImportDraftRow,
  type ImportRowKind,
} from "@/domain/import";
import { createId } from "@/domain/snapshot";
import type { VaultSnapshot } from "@/domain/types";
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
        institutionId: t.institutionId,
        institutionOther: t.institutionOther,
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

  const rows = toDomainRows(draft, confirmation.selectedIds);
  if (rows.length === 0) {
    throw new ImportConfirmationRequiredError(
      "Selecione ao menos um lançamento válido.",
    );
  }

  // Snapshot before for atomicity (rollback via stored ids)
  const beforeExpenseIds = new Set(snapshot.oneTimeExpenses.map((e) => e.id));
  const beforeIncomeIds = new Set(
    (snapshot.oneTimeIncomes ?? []).map((e) => e.id),
  );

  const applied = applyImportDraft(snapshot, rows);

  const createdExpenses = applied.snapshot.oneTimeExpenses
    .filter((e) => !beforeExpenseIds.has(e.id))
    .map((e) => e.id);
  const createdIncomes = (applied.snapshot.oneTimeIncomes ?? [])
    .filter((e) => !beforeIncomeIds.has(e.id))
    .map((e) => e.id);

  const batchId = createId("ibatch");
  const result: ImportCommitResult = {
    ok: true,
    addedExpenses: applied.addedExpenses,
    addedIncomes: applied.addedIncomes,
    skippedDuplicates: applied.skippedDuplicates,
    skippedExcluded: applied.skippedExcluded,
    importBatchId: batchId,
    count: applied.addedExpenses + applied.addedIncomes,
  };

  const rollback: ImportRollbackRef = {
    batchId,
    userSessionId: activeUserSessionId,
    createdIds: { expenses: createdExpenses, incomes: createdIncomes },
    importedAt: new Date().toISOString(),
  };

  return { snapshot: applied.snapshot, result, rollback };
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
    ...ref.createdIds.expenses.map((id) =>
      id.startsWith("tx_") ? id : `tx_${id}`,
    ),
    ...ref.createdIds.incomes.map((id) =>
      id.startsWith("tx_") ? id : `tx_${id}`,
    ),
  ]);
  return {
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
