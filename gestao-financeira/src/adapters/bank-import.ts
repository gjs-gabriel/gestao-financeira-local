import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { NormalizedBankTx } from "@/domain";
import {
  IMPORT_MAX_CELLS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_STRING_CHARS,
} from "@/security/limits";

export type ColumnRole = "date" | "description" | "amount" | "debit" | "credit" | "ignore";

export interface ColumnMapping {
  date: number | null;
  description: number | null;
  /** Coluna única de valor (assinado ou absoluto) */
  amount: number | null;
  debit: number | null;
  credit: number | null;
  institution: number | null;
}

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  suggestedMapping: ColumnMapping;
}

const DATE_HEADERS = [
  "data",
  "date",
  "dt",
  "data lançamento",
  "data lancamento",
  "data da operação",
  "data da operacao",
  "dt. movimento",
  "dt movimento",
];
const DESC_HEADERS = [
  "descrição",
  "descricao",
  "histórico",
  "historico",
  "lançamento",
  "lancamento",
  "memo",
  "detalhe",
  "estabelecimento",
  "nome",
  "description",
];
const AMOUNT_HEADERS = [
  "valor",
  "value",
  "amount",
  "vlr",
  "montante",
];
const DEBIT_HEADERS = ["débito", "debito", "debit", "saída", "saida"];
const CREDIT_HEADERS = ["crédito", "credito", "credit", "entrada"];
const INSTITUTION_HEADERS = [
  "banco",
  "instituição",
  "instituicao",
  "institution",
  "bank",
  "conta",
  "origem",
];

function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function findCol(headers: string[], candidates: string[]): number | null {
  const normalized = headers.map(normHeader);
  for (const c of candidates) {
    const nc = normHeader(c);
    const idx = normalized.findIndex(
      (h) => h === nc || h.includes(nc) || nc.includes(h),
    );
    if (idx >= 0) return idx;
  }
  return null;
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  return {
    date: findCol(headers, DATE_HEADERS),
    description: findCol(headers, DESC_HEADERS),
    amount: findCol(headers, AMOUNT_HEADERS),
    debit: findCol(headers, DEBIT_HEADERS),
    credit: findCol(headers, CREDIT_HEADERS),
    institution: findCol(headers, INSTITUTION_HEADERS),
  };
}

/** Parse valor BR/US: 1.234,56 | 1,234.56 | 1234.56 | -50,00 */
export function parseBrAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  // (1.234,56) → -1234.56
  const paren = /^\((.+)\)$/.exec(s);
  if (paren) s = `-${paren[1]}`;

  const neg = s.startsWith("-") || s.startsWith("−");
  if (neg) s = s.slice(1);

  // Both comma and dot: decide decimal separator
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // 1.234,56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // 1234,56 or 1.234 (unlikely with only comma as thousands)
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  const v = Math.round(n * 100) / 100;
  return neg ? -v : v;
}

/** DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, Excel serial as string */
export function parseBrDate(raw: string): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY
  const br = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    const m = String(Number(br[2])).padStart(2, "0");
    const d = String(Number(br[1])).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Excel serial number
  const serial = Number(s);
  if (!Number.isNaN(serial) && serial > 20000 && serial < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + serial * 86400000;
    const dt = new Date(ms);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function cellsToStrings(row: unknown[]): string[] {
  return row.map((c) => {
    if (c == null) return "";
    if (c instanceof Date) {
      const y = c.getFullYear();
      const m = String(c.getMonth() + 1).padStart(2, "0");
      const d = String(c.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(c).trim();
  });
}

export async function parseBankFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

async function parseCsv(file: File): Promise<ParsedSheet> {
  const text = await file.text();
  if (text.length > IMPORT_MAX_STRING_CHARS * IMPORT_MAX_ROWS) {
    throw new Error("CSV excede o limite de tamanho processável.");
  }
  // Detect delimiter: count ; vs , in first non-empty line
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semis > commas ? ";" : ",";

  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length && (!parsed.data || parsed.data.length === 0)) {
    throw new Error(parsed.errors[0]?.message ?? "CSV inválido");
  }
  let data = (parsed.data as string[][]).filter((r) =>
    r.some((c) => String(c ?? "").trim()),
  );
  if (data.length === 0) throw new Error("Arquivo vazio");
  if (data.length - 1 > IMPORT_MAX_ROWS) {
    throw new Error(`Planilha excede o limite de ${IMPORT_MAX_ROWS} linhas.`);
  }

  const headers = data[0]!.map((h) =>
    String(h ?? "").trim().slice(0, IMPORT_MAX_STRING_CHARS),
  );
  const rows = data.slice(1).map((r) =>
    cellsToStrings(r).map((c) => c.slice(0, IMPORT_MAX_STRING_CHARS)),
  );
  const cells = rows.reduce((n, r) => n + r.length, headers.length);
  if (cells > IMPORT_MAX_CELLS) {
    throw new Error("Planilha excede o limite de células permitido.");
  }
  return {
    headers,
    rows,
    suggestedMapping: suggestColumnMapping(headers),
  };
}

async function parseXlsx(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  // Entrada não confiável — sem fórmulas/HTML executáveis
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia");

  const data: string[][] = [];
  let cellCount = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > IMPORT_MAX_ROWS + 1) {
      throw new Error(`Planilha excede o limite de ${IMPORT_MAX_ROWS} linhas.`);
    }
    const values = row.values as unknown[];
    // exceljs: values[0] is unused (1-indexed)
    const cells = values.slice(1).map((c) => {
      cellCount += 1;
      if (cellCount > IMPORT_MAX_CELLS) {
        throw new Error("Planilha excede o limite de células permitido.");
      }
      if (c == null) return "";
      if (c instanceof Date) {
        const y = c.getFullYear();
        const m = String(c.getMonth() + 1).padStart(2, "0");
        const d = String(c.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      if (typeof c === "object" && c !== null && "text" in c) {
        return String((c as { text: string }).text ?? "")
          .trim()
          .slice(0, IMPORT_MAX_STRING_CHARS);
      }
      if (typeof c === "object" && c !== null && "result" in c) {
        // fórmula — usar só o resultado já calculado, nunca executar
        return String((c as { result: unknown }).result ?? "")
          .trim()
          .slice(0, IMPORT_MAX_STRING_CHARS);
      }
      return String(c).trim().slice(0, IMPORT_MAX_STRING_CHARS);
    });
    if (cells.some((x) => x)) data.push(cells);
  });

  if (data.length === 0) throw new Error("Planilha vazia");
  const headers = data[0]!;
  const rows = data.slice(1);
  return {
    headers,
    rows,
    suggestedMapping: suggestColumnMapping(headers),
  };
}

/** Aplica mapeamento → transações normalizadas (domínio). */
export function mapRowsToTransactions(
  rows: string[][],
  mapping: ColumnMapping,
): NormalizedBankTx[] {
  if (mapping.date == null) {
    throw new Error("Mapeie a coluna de data");
  }
  const hasSplit = mapping.debit != null || mapping.credit != null;
  if (!hasSplit && mapping.amount == null) {
    throw new Error("Mapeie a coluna de valor (ou débito/crédito)");
  }

  const out: NormalizedBankTx[] = [];
  rows.forEach((row, i) => {
    const dateRaw = row[mapping.date!] ?? "";
    const date = parseBrDate(dateRaw);
    if (!date) return;

    const description =
      mapping.description != null
        ? (row[mapping.description] ?? "").trim()
        : `Linha ${i + 2}`;

    let amount = 0;
    if (hasSplit) {
      const deb =
        mapping.debit != null ? parseBrAmount(row[mapping.debit] ?? "") : null;
      const cred =
        mapping.credit != null
          ? parseBrAmount(row[mapping.credit] ?? "")
          : null;
      if (cred != null && cred !== 0) amount = Math.abs(cred);
      else if (deb != null && deb !== 0) amount = -Math.abs(deb);
      else return;
    } else {
      const parsed = parseBrAmount(row[mapping.amount!] ?? "");
      if (parsed == null || parsed === 0) return;
      amount = parsed;
    }

    out.push({
      rowIndex: i,
      date,
      description: description || `Linha ${i + 2}`,
      amount,
      institutionRaw:
        mapping.institution != null
          ? (row[mapping.institution] ?? "").trim() || undefined
          : undefined,
    });
  });
  return out;
}
