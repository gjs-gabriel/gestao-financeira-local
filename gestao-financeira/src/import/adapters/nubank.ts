/**
 * Parser específico Nubank — refina extratos e informes já detectados.
 */

import type { ParsedDocument, ParsedDocumentRow } from "../types";

const NU_SKIP =
  /total de (entradas|sa[ií]das)|saldo (inicial|final)|rendimento l[ií]quido|ouvidoria|valores em r\$/i;

export function refineNubankDocument(
  doc: ParsedDocument,
  _lines: string[],
): ParsedDocument {
  if (doc.documentType === "income_report") {
    return {
      ...doc,
      warnings: [
        ...doc.warnings,
        "Adapter Nubank: informe de rendimentos processado.",
      ],
    };
  }

  // Extrato: reforça typeHint de aplicação / fatura / rendimento
  const rows: ParsedDocumentRow[] = doc.rows.map((row) => {
    const raw = row.rawText || row.descriptionCandidate || "";
    if (/aplica[cç][aã]o\s+fundo/i.test(raw)) {
      const holding =
        row.holdingName ||
        raw
          .replace(/aplica[cç][aã]o\s+fundo/i, "")
          .replace(/R\$.*/i, "")
          .trim();
      return {
        ...row,
        typeHint: "investment",
        holdingName: holding || row.holdingName,
        amountCandidate:
          row.amountCandidate != null
            ? -Math.abs(row.amountCandidate)
            : row.amountCandidate,
      };
    }
    if (/pagamento de fatura/i.test(raw)) {
      return { ...row, typeHint: "expense" };
    }
    if (/rendimento/i.test(raw)) {
      return {
        ...row,
        typeHint: "income",
        amountCandidate:
          row.amountCandidate != null
            ? Math.abs(row.amountCandidate)
            : row.amountCandidate,
      };
    }
    return row;
  });

  const filtered = rows.filter((r) => !NU_SKIP.test(r.descriptionCandidate ?? ""));

  return {
    ...doc,
    rows: filtered.length > 0 ? filtered : rows,
    warnings: [
      ...doc.warnings.filter((w) => !/Adapter Nubank/i.test(w)),
      "Adapter Nubank: movimentações refinadas (aplicação ≠ posição).",
    ],
  };
}

export function isNubankSample(fileName: string, text: string): boolean {
  return /nubank|nu_/i.test(fileName) || /nubank|nu pagamentos/i.test(text);
}
