/**
 * CSV configurável — detecta separador, encoding básico e mapeia colunas.
 */

import Papa from "papaparse";
import { createId } from "@/domain/snapshot";
import { parseBrAmount } from "@/adapters/bank-import";
import {
  emptyIntermediate,
  type FinancialImportIntermediate,
} from "../schema/intermediate";
import { normalizeDescription } from "../normalize/names";

export type CsvColumnRole =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "ignore";

export type CsvColumnMapping = Record<string, CsvColumnRole>;

const DATE_ALIASES = [
  "data",
  "data movimento",
  "data movimentacao",
  "data lançamento",
  "data lancamento",
  "date",
  "dt",
];
const DESC_ALIASES = [
  "descricao",
  "descrição",
  "historico",
  "histórico",
  "memo",
  "description",
  "lancamento",
  "lançamento",
  "name",
];
const AMOUNT_ALIASES = ["valor", "valor r$", "amount", "value", "vlr"];
const DEBIT_ALIASES = ["debito", "débito", "debit", "saida", "saída"];
const CREDIT_ALIASES = ["credito", "crédito", "credit", "entrada"];
const BALANCE_ALIASES = ["saldo", "balance"];

function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = {
    ";": (first.match(/;/g) ?? []).length,
    ",": (first.match(/,/g) ?? []).length,
    "\t": (first.match(/\t/g) ?? []).length,
  };
  if (counts["\t"] >= counts[";"] && counts["\t"] >= counts[","]) return "\t";
  if (counts[";"] >= counts[","]) return ";";
  return ",";
}

export function suggestCsvMapping(headers: string[]): CsvColumnMapping {
  const map: CsvColumnMapping = {};
  for (const h of headers) {
    const n = normHeader(h);
    if (DATE_ALIASES.includes(n)) map[h] = "date";
    else if (DESC_ALIASES.includes(n)) map[h] = "description";
    else if (AMOUNT_ALIASES.includes(n)) map[h] = "amount";
    else if (DEBIT_ALIASES.includes(n)) map[h] = "debit";
    else if (CREDIT_ALIASES.includes(n)) map[h] = "credit";
    else if (BALANCE_ALIASES.includes(n)) map[h] = "balance";
    else map[h] = "ignore";
  }
  return map;
}

function parseDateCell(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const br = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    let y = br[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }
  return null;
}

function parseAmountCell(raw: string): number | null {
  if (!raw?.trim()) return null;
  const br = parseBrAmount(raw);
  if (br != null) return br;
  const n = Number(raw.replace(/[R$\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseCsvText(
  text: string,
  fileName: string,
  mapping?: CsvColumnMapping,
): {
  intermediate: FinancialImportIntermediate;
  headers: string[];
  mapping: CsvColumnMapping;
  needsMapping: boolean;
} {
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const suggested = mapping ?? suggestCsvMapping(headers);
  const hasDate = Object.values(suggested).includes("date");
  const hasAmount =
    Object.values(suggested).includes("amount") ||
    (Object.values(suggested).includes("debit") &&
      Object.values(suggested).includes("credit"));
  const hasDesc = Object.values(suggested).includes("description");
  const needsMapping = !hasDate || !hasAmount || !hasDesc;

  const mid = emptyIntermediate(fileName, "csv");
  mid.source.document_type = "BANK_STATEMENT";

  if (needsMapping && !mapping) {
    mid.warnings.push(
      "Não foi possível mapear automaticamente as colunas do CSV.",
    );
    return { intermediate: mid, headers, mapping: suggested, needsMapping: true };
  }

  const MAX_ROWS = 20_000;
  const rows = (parsed.data ?? []).slice(0, MAX_ROWS);

  for (const row of rows) {
    let date: string | null = null;
    let description = "";
    let amount: number | null = null;
    let debit: number | null = null;
    let credit: number | null = null;

    for (const [col, role] of Object.entries(suggested)) {
      const cell = String(row[col] ?? "");
      if (role === "date") date = parseDateCell(cell);
      else if (role === "description") description = cell.trim();
      else if (role === "amount") amount = parseAmountCell(cell);
      else if (role === "debit") debit = parseAmountCell(cell);
      else if (role === "credit") credit = parseAmountCell(cell);
    }

    if (amount == null) {
      if (debit != null && debit !== 0) amount = -Math.abs(debit);
      else if (credit != null && credit !== 0) amount = Math.abs(credit);
    }
    if (amount == null || !date) continue;

    const signed = amount;
    const abs = Math.abs(signed);
    mid.transactions.push({
      temp_id: createId("itx"),
      kind: signed < 0 ? "DEBIT" : "CREDIT",
      transaction_date: date,
      amount: abs,
      signed_amount: signed,
      raw_description: description || "Lançamento",
      normalized_description: normalizeDescription(description),
      evidence: { extraction_method: "CSV", confidence: 0.85 },
    });
  }

  mid.source.period = {
    start: mid.transactions.map((t) => t.transaction_date).filter(Boolean).sort()[0] ?? null,
    end:
      mid.transactions
        .map((t) => t.transaction_date)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
  };

  return {
    intermediate: mid,
    headers,
    mapping: suggested,
    needsMapping: false,
  };
}

export async function parseCsvFile(
  file: File,
  mapping?: CsvColumnMapping,
): Promise<ReturnType<typeof parseCsvText>> {
  const text = await file.text();
  return parseCsvText(text, file.name, mapping);
}
