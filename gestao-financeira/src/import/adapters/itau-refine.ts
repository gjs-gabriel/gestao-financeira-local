/**
 * Parser específico Itaú — extratos e OFX-like labels.
 */

import type { ParsedDocument } from "../types";

export function refineItauDocument(doc: ParsedDocument): ParsedDocument {
  const rows = doc.rows.map((row) => {
    const d = row.descriptionCandidate ?? "";
    if (/SIB\s|SISPAG|PAG\s+FOR/i.test(d)) {
      return { ...row, typeHint: "expense" as const };
    }
    if (/REND PAGO|RENDIMENTO|JUROS/i.test(d)) {
      return {
        ...row,
        typeHint: "income" as const,
        amountCandidate:
          row.amountCandidate != null
            ? Math.abs(row.amountCandidate)
            : row.amountCandidate,
      };
    }
    if (/APL\s|APLICACAO|APLICAÇÃO|RESGATE/i.test(d)) {
      return { ...row, typeHint: "investment" as const };
    }
    return row;
  });

  return {
    ...doc,
    rows,
    warnings: [
      ...doc.warnings.filter((w) => !/Adapter Itaú/i.test(w)),
      "Adapter Itaú: classificações de extrato refinadas.",
    ],
  };
}

export function isItauSample(fileName: string, text: string): boolean {
  return /ita[uú]/i.test(fileName) || /ita[uú]/i.test(text);
}
