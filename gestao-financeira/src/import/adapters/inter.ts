/**
 * Parser específico Banco Inter — posições e nomes de fundos.
 */

import type { ParsedDocument } from "../types";
import { normalizeInvestmentName } from "../normalize/names";

export function refineInterDocument(doc: ParsedDocument): ParsedDocument {
  const holdings = (doc.holdings ?? []).map((h) => ({
    ...h,
    name: h.name.replace(/\s+/g, " ").trim(),
    notes: [h.notes, `normalized:${normalizeInvestmentName(h.name)}`]
      .filter(Boolean)
      .join(" · "),
  }));

  const rows = doc.rows.map((row) => {
    if (/inter\s+conservador|aplica[cç][aã]o|resgate/i.test(row.rawText)) {
      return {
        ...row,
        typeHint: "investment" as const,
        holdingName:
          row.holdingName ||
          row.descriptionCandidate?.replace(
            /^(aplica[cç][aã]o|resgate)\s*/i,
            "",
          ),
      };
    }
    return row;
  });

  return {
    ...doc,
    holdings,
    rows,
    warnings: [
      ...doc.warnings.filter((w) => !/Adapter Inter/i.test(w)),
      "Adapter Inter: nomes de fundos normalizados para matching.",
    ],
  };
}

export function isInterSample(fileName: string, text: string): boolean {
  return (
    (/inter/i.test(fileName) && !/interest/i.test(fileName)) ||
    /banco inter/i.test(text)
  );
}
