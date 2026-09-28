import { matchCategorizationRule } from "./budgets";
import { suggestCategoryFromHistory } from "./intelligence";
import { createId, touchSnapshot } from "./snapshot";
import { matchInstitutionByName } from "./institutions";
import {
  defaultAccountId,
  upsertOneTimeExpenseSynced,
  upsertOneTimeIncomeSynced,
} from "./sync";
import type {
  OneTimeExpense,
  OneTimeIncome,
  VaultSnapshot,
} from "./types";

/** Transação normalizada vinda do adapter de extrato (sem React/DOM). */
export interface NormalizedBankTx {
  rowIndex: number;
  date: string;
  description: string;
  /** Valor assinado: positivo = crédito, negativo = débito */
  amount: number;
  /** Texto bruto da coluna banco (opcional) */
  institutionRaw?: string;
}

export type ImportRowKind = "expense" | "income";

export interface ImportDraftRow {
  rowIndex: number;
  date: string;
  description: string;
  amount: number;
  kind: ImportRowKind;
  categoryId?: string;
  institutionId?: string;
  institutionOther?: string;
  include: boolean;
  duplicate: boolean;
}

export function detectDuplicate(
  snapshot: VaultSnapshot,
  date: string,
  amount: number,
  description: string,
  kind: ImportRowKind,
): boolean {
  const normDesc = description.trim().toLowerCase();
  if (kind === "expense") {
    const inLegacy = snapshot.oneTimeExpenses.some(
      (e) =>
        e.date === date &&
        Math.abs(e.amount - amount) < 0.005 &&
        e.name.trim().toLowerCase() === normDesc,
    );
    if (inLegacy) return true;
    return (snapshot.transactions ?? []).some(
      (tx) =>
        tx.kind === "expense" &&
        tx.date === date &&
        Math.abs(tx.amount - amount) < 0.005 &&
        tx.description.trim().toLowerCase() === normDesc &&
        tx.status !== "ignored",
    );
  }
  const inOneTime = (snapshot.oneTimeIncomes ?? []).some(
    (e) =>
      e.date === date &&
      Math.abs(e.amount - amount) < 0.005 &&
      e.name.trim().toLowerCase() === normDesc,
  );
  if (inOneTime) return true;
  const inTx = (snapshot.transactions ?? []).some(
    (tx) =>
      tx.kind === "income" &&
      tx.date === date &&
      Math.abs(tx.amount - amount) < 0.005 &&
      tx.description.trim().toLowerCase() === normDesc &&
      tx.status !== "ignored",
  );
  if (inTx) return true;
  return snapshot.incomes.some(
    (e) =>
      Math.abs(e.amount - amount) < 0.005 &&
      e.name.trim().toLowerCase() === normDesc,
  );
}

export function buildImportDraft(
  snapshot: VaultSnapshot,
  txs: NormalizedBankTx[],
  defaults?: { institutionId?: string; institutionOther?: string },
): ImportDraftRow[] {
  const institutions = snapshot.institutions ?? [];
  return txs.map((tx) => {
    const abs = Math.abs(tx.amount);
    const kind: ImportRowKind = tx.amount < 0 ? "expense" : "income";
    const fromRow = tx.institutionRaw
      ? matchInstitutionByName(tx.institutionRaw, institutions)
      : {};
    const institutionId =
      fromRow.institutionId ?? defaults?.institutionId;
    const institutionOther =
      fromRow.institutionOther ??
      (institutionId === "inst-outro" ? defaults?.institutionOther : undefined);
    const matched = matchCategorizationRule(
      snapshot.categorizationRules ?? [],
      { description: tx.description || "", institutionId },
    );
    const suggested =
      matched?.categoryId ??
      suggestCategoryFromHistory(
        snapshot,
        tx.description || "",
        institutionId,
      )?.categoryId;
    return {
      rowIndex: tx.rowIndex,
      date: tx.date,
      description: tx.description || "(sem descrição)",
      amount: abs,
      kind,
      categoryId: suggested,
      institutionId,
      institutionOther,
      include: abs > 0,
      duplicate: detectDuplicate(
        snapshot,
        tx.date,
        abs,
        tx.description || "(sem descrição)",
        kind,
      ),
    };
  });
}

export interface ApplyImportResult {
  snapshot: VaultSnapshot;
  addedExpenses: number;
  addedIncomes: number;
  skippedDuplicates: number;
  skippedExcluded: number;
}

export function applyImportDraft(
  snapshot: VaultSnapshot,
  rows: ImportDraftRow[],
): ApplyImportResult {
  const now = new Date().toISOString();
  let next = snapshot;
  let addedExpenses = 0;
  let addedIncomes = 0;
  let skippedDuplicates = 0;
  let skippedExcluded = 0;

  for (const row of rows) {
    if (!row.include) {
      skippedExcluded += 1;
      continue;
    }
    if (row.duplicate) {
      skippedDuplicates += 1;
      continue;
    }
    if (row.amount <= 0 || !row.date) {
      skippedExcluded += 1;
      continue;
    }

    const inst = {
      institutionId: row.institutionId,
      institutionOther: row.institutionOther,
    };

    if (row.kind === "expense") {
      if (
        detectDuplicate(next, row.date, row.amount, row.description, "expense")
      ) {
        skippedDuplicates += 1;
        continue;
      }
      const item: OneTimeExpense = {
        id: createId("otx"),
        name: row.description.slice(0, 200),
        amount: row.amount,
        date: row.date,
        categoryId: row.categoryId,
        ...inst,
        notes: "Importado do extrato",
        createdAt: now,
        updatedAt: now,
      };
      next = upsertOneTimeExpenseSynced(next, item, { source: "import" });
      addedExpenses += 1;
    } else {
      if (
        detectDuplicate(next, row.date, row.amount, row.description, "income")
      ) {
        skippedDuplicates += 1;
        continue;
      }
      const item: OneTimeIncome = {
        id: createId("oti"),
        name: row.description.slice(0, 200),
        amount: row.amount,
        date: row.date,
        categoryId: row.categoryId,
        ...inst,
        notes: "Importado do extrato",
        createdAt: now,
        updatedAt: now,
      };
      next = upsertOneTimeIncomeSynced(next, item, { source: "import" });
      addedIncomes += 1;
    }
  }

  void defaultAccountId(next);
  return {
    snapshot: touchSnapshot(next, {}),
    addedExpenses,
    addedIncomes,
    skippedDuplicates,
    skippedExcluded,
  };
}
