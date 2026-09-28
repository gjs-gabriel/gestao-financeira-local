import { validateImportFile } from "../file-validation";
import { parsePdfDocument } from "./pdf-parser";
import { parseSpreadsheetDocument } from "./spreadsheet-parser";
import type { ParsedDocument } from "../types";

/**
 * Entrada única do parser. Isolado do cofre.
 * Nunca grava dados financeiros.
 */
export async function parseDocument(file: File): Promise<ParsedDocument> {
  const validation = await validateImportFile(file);
  if (!validation.ok || !validation.kind) {
    throw new Error(validation.error ?? "Arquivo inválido");
  }

  if (validation.kind === "pdf") {
    return parsePdfDocument(file);
  }
  return parseSpreadsheetDocument(file);
}
