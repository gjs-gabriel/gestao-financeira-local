import { validateImportFile } from "../file-validation";
import { parsePdfDocument } from "./pdf-parser";
import { parseSpreadsheetDocument } from "./spreadsheet-parser";
import { parseOfxFile } from "./ofx-parser";
import { parseCsvFile, parseCsvText, type CsvColumnMapping } from "./csv-parser";
import type { ParsedDocument } from "../types";
import { createId } from "@/domain/snapshot";
import type { FinancialImportIntermediate } from "../schema/intermediate";

/**
 * Entrada única do parser. Isolado do cofre.
 * Nunca grava dados financeiros.
 */
export async function parseDocument(
  file: File,
  options?: { password?: string; csvMapping?: CsvColumnMapping },
): Promise<ParsedDocument> {
  const validation = await validateImportFile(file);
  if (!validation.ok || !validation.kind) {
    throw new Error(validation.error ?? "Arquivo inválido");
  }

  if (validation.kind === "pdf") {
    return parsePdfDocument(file, options);
  }

  if (validation.kind === "ofx") {
    const mid = await parseOfxFile(file);
    return intermediateToParsedDocument(mid);
  }

  if (validation.kind === "csv") {
    const rawText = await file.text();
    const result = parseCsvText(rawText, file.name, options?.csvMapping);
    if (result.needsMapping && !options?.csvMapping) {
      return {
        documentType: "spreadsheet",
        sourceKind: "csv",
        period: { start: null, end: null },
        rows: [],
        warnings: [
          ...result.intermediate.warnings,
          "Mapeie as colunas do CSV para continuar.",
        ],
        accounts: [],
        holdings: [],
        csvMappingRequired: {
          headers: result.headers,
          suggested: result.mapping,
          rawText,
        },
      };
    }
    return intermediateToParsedDocument(result.intermediate);
  }

  return parseSpreadsheetDocument(file);
}

/** Reaplica CSV já lido com mapeamento confirmado pelo usuário. */
export function parseCsvRawWithMapping(
  rawText: string,
  fileName: string,
  mapping: CsvColumnMapping,
): ParsedDocument {
  const result = parseCsvText(rawText, fileName, mapping);
  return intermediateToParsedDocument(result.intermediate);
}

/** Adapta formato intermediário ao contrato ParsedDocument do wizard. */
export function intermediateToParsedDocument(
  mid: FinancialImportIntermediate,
): ParsedDocument {
  const sourceKind =
    mid.source.source_kind === "ofx"
      ? "ofx"
      : mid.source.source_kind === "csv"
        ? "csv"
        : mid.source.source_kind === "xlsx"
          ? "xlsx"
          : mid.source.source_kind === "xls"
            ? "xls"
            : mid.source.source_kind === "pdf"
              ? "pdf"
              : "csv";

  return {
    documentType:
      mid.source.document_type === "INCOME_REPORT"
        ? "income_report"
        : mid.source.document_type === "BANK_STATEMENT"
          ? "bank_statement"
          : "unknown",
    sourceKind,
    period: mid.source.period ?? { start: null, end: null },
    openingBalance: mid.statement_summaries[0]?.initial_balance ?? null,
    closingBalance: mid.statement_summaries[0]?.final_balance ?? null,
    institution: mid.source.institution_id
      ? {
          institutionId: mid.source.institution_id,
          institutionName: mid.source.institution ?? mid.source.institution_id,
        }
      : null,
    accounts: mid.accounts.map((a) => ({
      id: a.temp_id,
      institutionId: a.institution_id ?? "inst-outro",
      institutionName: a.institution_name ?? "Instituição",
      agency: a.agency ?? null,
      accountNumber: a.account_id ?? null,
      accountDigits: a.account_digits ?? null,
      label: a.label ?? "Conta",
      accountType:
        a.type === "savings"
          ? "savings"
          : a.type === "investment_cash"
            ? "investment_cash"
            : "checking",
      openingBalance: a.opening_balance ?? null,
      closingBalance: a.closing_balance ?? 0,
      asOf: a.as_of ?? new Date().toISOString().slice(0, 10),
      periodStart: mid.source.period?.start ?? null,
      balanceMode: "statement" as const,
      include: true,
    })),
    holdings: mid.investment_positions.map((p) => {
      const inv = mid.investments.find((i) => i.temp_id === p.investment_temp_id);
      return {
        id: p.temp_id,
        institutionId: inv?.institution_id ?? "inst-outro",
        institutionName: inv?.institution_name ?? "Instituição",
        name: inv?.raw_name ?? "Investimento",
        amount: p.value,
        asOf: p.date,
        classification: "renda_fixa" as const,
        mode: "snapshot" as const,
        include: true,
      };
    }),
    rows: mid.transactions.map((t) => ({
      id: t.temp_id || createId("row"),
      rawText: t.raw_description,
      dateCandidate: t.transaction_date,
      amountCandidate: t.signed_amount,
      descriptionCandidate: t.raw_description,
      typeHint:
        t.kind === "APPLICATION" || t.kind === "REDEMPTION"
          ? ("investment" as const)
          : t.kind === "CREDIT"
            ? ("income" as const)
            : t.kind === "DEBIT"
              ? ("expense" as const)
              : ("unknown" as const),
      holdingName:
        mid.investments.find((i) => i.temp_id === t.investment_temp_id)
          ?.raw_name ?? null,
    })),
    warnings: mid.warnings,
  };
}
