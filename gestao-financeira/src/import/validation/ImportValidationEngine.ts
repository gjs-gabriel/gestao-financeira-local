import type {
  FinancialImportDraft,
  ImportValidationResult,
} from "../types";

export function validateImportDraft(
  draft: FinancialImportDraft,
): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [...draft.documentInfo.fileName ? [] : ["Arquivo sem nome"]];

  let blockingErrors = 0;
  let attentionCount = 0;
  let readyCount = 0;

  for (const tx of draft.transactions) {
    if (tx.status === "ignored") continue;
    if (tx.errors.length > 0) {
      blockingErrors += 1;
    } else if (tx.status === "needs_attention" || tx.duplicate) {
      attentionCount += 1;
    } else if (tx.include) {
      readyCount += 1;
    }
  }

  const included = draft.transactions.filter((t) => t.include && !t.duplicate);
  if (included.length === 0) {
    warnings.push("Nenhum lançamento selecionado para importar.");
  }

  const income = included
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = included
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const opening = draft.documentInfo.openingBalance;
  const closing = draft.documentInfo.closingBalance;
  let balanceCheck: ImportValidationResult["balanceCheck"] = {
    applicable: false,
  };

  if (
    opening != null &&
    closing != null &&
    Number.isFinite(opening) &&
    Number.isFinite(closing)
  ) {
    const expected = Math.round((opening + income - expense) * 100) / 100;
    const ok = Math.abs(expected - closing) < 0.05;
    balanceCheck = {
      applicable: true,
      expected,
      reported: closing,
      ok,
    };
    if (!ok) {
      warnings.push(
        "Os valores encontrados não fecham com o saldo informado no documento.",
      );
    }
  }

  if (blockingErrors > 0) {
    errors.push(
      `${blockingErrors} lançamento(s) com erro estrutural precisam ser corrigidos.`,
    );
  }

  return {
    errors,
    warnings,
    balanceCheck,
    blockingErrors,
    attentionCount,
    readyCount,
  };
}

export function draftCanProceedToConfirm(draft: FinancialImportDraft): boolean {
  const v = validateImportDraft(draft);
  if (v.blockingErrors > 0) return false;
  const selected = draft.transactions.filter((t) => t.include && !t.duplicate);
  return selected.length > 0;
}
