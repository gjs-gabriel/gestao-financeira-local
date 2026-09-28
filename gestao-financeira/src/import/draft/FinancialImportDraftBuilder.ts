import { createId } from "@/domain/snapshot";
import { detectDuplicate } from "@/domain/import";
import type { VaultSnapshot } from "@/domain/types";
import {
  IMPORTER_VERSION,
  confidenceLevel,
  type AIImportResult,
  type FinancialImportDraft,
  type FinancialImportDraftTxn,
  type ParsedDocument,
} from "../types";
import { validateImportDraft } from "../validation/ImportValidationEngine";

export function buildFinancialImportDraft(input: {
  parsed: ParsedDocument;
  ai: AIImportResult;
  fileName: string;
  userSessionId: string;
  snapshot: VaultSnapshot | null;
}): FinancialImportDraft {
  const { parsed, ai, fileName, userSessionId, snapshot } = input;
  const byId = new Map(ai.transactions.map((t) => [t.sourceRowId, t]));

  const transactions: FinancialImportDraftTxn[] = parsed.rows.map((row) => {
    const sug = byId.get(row.id);
    const signed =
      sug?.amount ??
      row.amountCandidate ??
      0;
    const abs = Math.abs(signed);
    const date = sug?.date ?? row.dateCandidate ?? "";
    const description =
      sug?.description ?? row.descriptionCandidate ?? "Lançamento";
    const type =
      sug?.type ??
      row.typeHint ??
      (signed < 0 ? "expense" : signed > 0 ? "income" : "unknown");
    const score = sug?.confidence ?? 0.5;
    const level = confidenceLevel(score);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!date) errors.push("Data ausente");
    if (!abs) errors.push("Valor inválido");
    if (type === "unknown") warnings.push("Tipo indefinido");
    if (level === "low") {
      warnings.push("Baixa confiança — revise categoria e tipo");
    }

    let duplicate = false;
    let duplicateReason: string | undefined;
    if (snapshot && date && abs > 0 && (type === "expense" || type === "income")) {
      duplicate = detectDuplicate(
        snapshot,
        date,
        abs,
        description,
        type === "income" ? "income" : "expense",
      );
      if (duplicate) {
        duplicateReason =
          "Semelhante a um lançamento já existente (data, valor e descrição).";
        warnings.push("Possível duplicata");
      }
    }

    // duplicata interna
    const status =
      errors.length > 0
        ? "error"
        : level === "low" || warnings.length > 0
          ? "needs_attention"
          : "ready";

    return {
      id: createId("idraft"),
      sourceRowId: row.id,
      date,
      description,
      amount: abs,
      signedAmount: type === "income" ? abs : -abs,
      type,
      categoryId: sug?.categoryIdSuggestion,
      categoryLabel: sug?.categorySuggestion ?? undefined,
      confidence: level,
      confidenceScore: score,
      status,
      include: errors.length === 0 && !duplicate,
      duplicate,
      duplicateReason,
      errors,
      warnings,
    };
  });

  // marcar duplicatas internas no draft
  const seen = new Map<string, string>();
  for (const tx of transactions) {
    const key = `${tx.date}|${tx.amount}|${tx.description.trim().toLowerCase()}|${tx.type}`;
    const prev = seen.get(key);
    if (prev) {
      tx.duplicate = true;
      tx.duplicateReason =
        "Semelhante a outro lançamento neste mesmo documento.";
      tx.warnings.push("Duplicata no arquivo");
      if (tx.status === "ready") tx.status = "needs_attention";
      tx.include = false;
    } else {
      seen.set(key, tx.id);
    }
  }

  const draft: FinancialImportDraft = {
    id: createId("imp"),
    userSessionId,
    source: parsed.sourceKind,
    documentInfo: {
      fileName,
      period: parsed.period,
      pages: parsed.pages,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
    },
    transactions,
    validation: {
      errors: [],
      warnings: [],
      balanceCheck: { applicable: false },
      blockingErrors: 0,
      attentionCount: 0,
      readyCount: 0,
    },
    status: "draft",
    createdAt: new Date().toISOString(),
    importerVersion: IMPORTER_VERSION,
  };

  draft.validation = validateImportDraft(draft);
  return draft;
}
