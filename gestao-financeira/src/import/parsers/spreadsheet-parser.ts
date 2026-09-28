import {
  mapRowsToTransactions,
  parseBankFile,
  parseBrAmount,
  type ColumnMapping,
} from "@/adapters/bank-import";
import type { ParsedDocument, ParsedDocumentRow } from "../types";

function rowId(i: number): string {
  return `row-${String(i + 1).padStart(3, "0")}`;
}

/** Parser CSV/Excel — reutiliza adapter existente, sem tocar no cofre. */
export async function parseSpreadsheetDocument(
  file: File,
  mappingOverride?: ColumnMapping,
): Promise<ParsedDocument> {
  const sheet = await parseBankFile(file);
  const mapping = mappingOverride ?? sheet.suggestedMapping;
  const txs = mapRowsToTransactions(sheet.rows, mapping);

  const rows: ParsedDocumentRow[] = txs.map((tx, i) => ({
    id: rowId(i),
    rawText: `${tx.date} ${tx.description} ${tx.amount}`,
    dateCandidate: tx.date,
    amountCandidate: tx.amount,
    descriptionCandidate: tx.description,
    typeHint: tx.amount < 0 ? "expense" : "income",
  }));

  if (rows.length === 0 && sheet.rows.length > 0) {
    sheet.rows.slice(0, 50).forEach((cells, i) => {
      const joined = cells.join(" ");
      rows.push({
        id: rowId(i),
        rawText: joined,
        dateCandidate: null,
        amountCandidate: null,
        descriptionCandidate: joined.slice(0, 120) || null,
      });
    });
  }

  const dates = rows
    .map((r) => r.dateCandidate)
    .filter((d): d is string => !!d)
    .sort();

  const lower = file.name.toLowerCase();
  const kind = lower.endsWith(".csv")
    ? "csv"
    : lower.endsWith(".xlsx")
      ? "xlsx"
      : "xls";

  return {
    documentType: "spreadsheet",
    sourceKind: kind,
    period: {
      start: dates[0] ?? null,
      end: dates[dates.length - 1] ?? null,
    },
    rows,
    warnings:
      rows.length === 0
        ? ["Nenhuma linha com data e valor foi identificada."]
        : [],
  };
}

export { parseBrAmount, type ColumnMapping };
