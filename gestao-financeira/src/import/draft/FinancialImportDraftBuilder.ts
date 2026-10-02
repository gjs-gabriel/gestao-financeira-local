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
import { parsedDocumentToIntermediate } from "../pipeline/to-intermediate";
import { reconcileImport } from "../reconcile/engine";
import type { FinancialImportIntermediate } from "../schema/intermediate";

export function buildFinancialImportDraft(input: {
  parsed: ParsedDocument;
  ai: AIImportResult;
  fileName: string;
  userSessionId: string;
  snapshot: VaultSnapshot | null;
  intermediate?: FinancialImportIntermediate;
}): FinancialImportDraft {
  const { parsed, ai, fileName, userSessionId, snapshot } = input;
  const byId = new Map(ai.transactions.map((t) => [t.sourceRowId, t]));

  const transactions: FinancialImportDraftTxn[] = parsed.rows.map((row) => {
    const sug = byId.get(row.id);
    const signed = sug?.amount ?? row.amountCandidate ?? 0;
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
    if (/pagamento de fatura/i.test(description)) {
      warnings.push(
        "Pagamento de fatura sai da conta. Confira se a compra já foi lançada no cartão.",
      );
    }
    if (type === "investment") {
      warnings.push(
        "Valor de movimentação — não interpreta automaticamente como saldo do investimento.",
      );
    }

    let duplicate = false;
    let duplicateReason: string | undefined;
    if (snapshot && date && abs > 0 && type === "investment") {
      duplicate = (snapshot.transactions ?? []).some(
        (tx) =>
          (tx.kind === "investment_buy" || tx.kind === "investment_sell") &&
          tx.date === date &&
          Math.abs(tx.amount - abs) < 0.005 &&
          tx.description.trim().toLowerCase() ===
            description.trim().toLowerCase() &&
          tx.status !== "ignored",
      );
      if (duplicate) {
        duplicateReason = "Este aporte ou resgate já foi importado.";
        warnings.push("Possível duplicata");
      }
    }
    if (
      snapshot &&
      date &&
      abs > 0 &&
      (type === "expense" || type === "income")
    ) {
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
      signedAmount:
        type === "income" ? abs : type === "investment" ? signed : -abs,
      type,
      categoryId: sug?.categoryIdSuggestion,
      categoryLabel: sug?.categorySuggestion ?? undefined,
      institutionId: parsed.institution?.institutionId,
      holdingName: row.holdingName,
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

  const seen = new Map<string, string>();
  for (const tx of transactions) {
    const key = `${tx.date}|${tx.amount}|${tx.description.trim().toLowerCase()}|${tx.type}`;
    if (seen.has(key)) {
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

  const intermediate =
    input.intermediate ?? parsedDocumentToIntermediate(parsed, fileName);
  const reconciliation = snapshot
    ? reconcileImport({ intermediate, snapshot })
    : undefined;

  const draft: FinancialImportDraft = {
    id: createId("imp"),
    userSessionId,
    source: parsed.sourceKind,
    documentType: parsed.documentType,
    institution: parsed.institution ?? null,
    accountSnapshots: (parsed.accounts ?? []).map((account) => ({
      ...account,
      include: account.include !== false,
    })),
    holdings: (parsed.holdings ?? []).map((holding) => ({
      ...holding,
      include: holding.include !== false,
    })),
    documentInfo: {
      fileName,
      period: parsed.period,
      pages: parsed.pages,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
    },
    transactions,
    intermediate,
    reconciliation,
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
