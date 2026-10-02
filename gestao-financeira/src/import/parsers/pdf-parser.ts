import { parseBrAmount } from "@/adapters/bank-import";
import {
  MAX_IMPORT_ROWS,
  MAX_IMPORT_STRING_CHARS,
  MAX_PDF_PAGES,
  MAX_PDF_TEXT_CHARS,
} from "@/security/limits";
import { sanitizeImportString } from "@/security/gfin-guard";
import { ImportPasswordRequiredError, type ParsedDocument, type ParsedDocumentRow } from "../types";
import { analyzeFinancialDocument, parseLooseDate } from "./br-document";
import { groupTextItemsIntoLines, type PdfTextItem } from "./pdf-lines";
import { applyInstitutionAdapter } from "../adapters/apply";
import { ocrPdfFile, type OcrProgress } from "../ocr/local-ocr";

const DATE_RE =
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;
const AMOUNT_RE =
  /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})/g;

function parseAmountCandidate(text: string): number | null {
  AMOUNT_RE.lastIndex = 0;
  let last: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(text)) !== null) {
    const n = parseBrAmount(match[1] ?? match[0]);
    if (n !== null) last = n;
  }
  return last;
}

function stripAmountAndDate(text: string): string {
  return text
    .replace(AMOUNT_RE, " ")
    .replace(DATE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSign(line: string, amount: number): number {
  const lower = line.toLowerCase();
  if (
    /credito|crédito|entrada|receb|salario|salário|pix in|transferencia recebida|dep[oó]sito/.test(
      lower,
    )
  ) {
    return Math.abs(amount);
  }
  if (
    /debito|débito|saida|saída|pagamento|compra|ifood|pix out|envio/.test(
      lower,
    )
  ) {
    return -Math.abs(amount);
  }
  return amount;
}

function isPasswordError(error: unknown): { incorrect: boolean } | null {
  if (!error || typeof error !== "object") return null;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  if (name !== "PasswordException" && !/password/i.test(message)) return null;
  const code = "code" in error ? Number(error.code) : 0;
  return { incorrect: code === 2 };
}

function firstAmountAfter(text: string, label: RegExp): number | null {
  const idx = text.search(label);
  if (idx < 0) return null;
  const slice = text.slice(idx, idx + 120).replace(label, " ");
  AMOUNT_RE.lastIndex = 0;
  const match = AMOUNT_RE.exec(slice);
  if (!match) return null;
  return parseBrAmount(match[1] ?? match[0]);
}

function parseGenericLines(lines: string[]): ParsedDocumentRow[] {
  const rows: ParsedDocumentRow[] = [];
  for (const line of lines) {
    if (rows.length >= MAX_IMPORT_ROWS) break;
    if (
      /ouvidoria|p[aá]gina \d|informe de rendimentos|bens e direitos/i.test(line)
    ) {
      continue;
    }
    const date = parseLooseDate(line);
    const amountRaw = parseAmountCandidate(line);
    if (!date || amountRaw === null) continue;
    const signed = inferSign(line, amountRaw);
    const desc =
      sanitizeImportString(stripAmountAndDate(line), MAX_IMPORT_STRING_CHARS) ||
      "Lançamento";
    rows.push({
      id: `row-${String(rows.length + 1).padStart(3, "0")}`,
      rawText: sanitizeImportString(line, 400),
      dateCandidate: date,
      amountCandidate: signed,
      descriptionCandidate: desc,
      typeHint: signed < 0 ? "expense" : "income",
    });
  }
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.dateCandidate}|${row.amountCandidate}|${row.descriptionCandidate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extrai texto de PDF via pdfjs.
 * Conteúdo tratado como NÃO CONFIÁVEL — nunca executar como HTML/JS.
 * `password` fica só na memória desta chamada.
 */
export async function parsePdfDocument(
  file: File,
  options?: { password?: string },
): Promise<ParsedDocument> {
  const password = options?.password?.slice(0, 128) ?? "";
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      password: password.length > 0 ? password : undefined,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
    }).promise;
  } catch (error) {
    const passwordError = isPasswordError(error);
    if (passwordError) {
      throw new ImportPasswordRequiredError(passwordError.incorrect || password.length > 0);
    }
    throw error;
  }

  const pageCount = doc.numPages;
  const pages = Math.min(pageCount, MAX_PDF_PAGES);
  const lines: string[] = [];
  let totalChars = 0;

  try {
    for (let p = 1; p <= pages; p++) {
      if (totalChars >= MAX_PDF_TEXT_CHARS) break;
      const page = await doc.getPage(p);
      const content = await page.getTextContent({
        includeMarkedContent: false,
      });
      const items: PdfTextItem[] = [];
      for (const it of content.items) {
        if ("str" in it && "transform" in it) {
          items.push({ str: it.str, transform: it.transform });
        }
      }
      const pageLines = groupTextItemsIntoLines(items);
      lines.push(...pageLines);
      totalChars += pageLines.join("").replace(/\s/g, "").length;
    }
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }

  const warnings: string[] = [];
  if (pageCount > MAX_PDF_PAGES) {
    warnings.push(
      `PDF com muitas páginas — processamos só as primeiras ${MAX_PDF_PAGES}.`,
    );
  }

  if (totalChars < 40) {
    return {
      documentType: "bank_statement",
      sourceKind: "pdf",
      pages,
      period: { start: null, end: null },
      rows: [],
      warnings: [
        ...warnings,
        "Este PDF parece conter imagens em vez de texto. Você pode rodar OCR local (offline).",
      ],
      needsOcr: true,
    };
  }

  return buildParsedFromLines(lines, file.name, pages, warnings);
}

/** Constrói ParsedDocument a partir de linhas (texto nativo ou OCR). */
export function buildParsedFromLines(
  lines: string[],
  fileName: string,
  pages: number,
  baseWarnings: string[] = [],
): ParsedDocument {
  const warnings = [...baseWarnings];
  const analysis = analyzeFinancialDocument(lines, fileName);
  if (analysis.recognized) {
    const { recognized: _recognized, ...document } = analysis;
    const adapted = applyInstitutionAdapter(
      { ...document, pages, warnings: [...warnings, ...document.warnings] },
      lines,
      fileName,
    );
    return adapted;
  }

  const rows = parseGenericLines(lines);
  const fullText = lines.join("\n").slice(0, MAX_PDF_TEXT_CHARS);
  const dates = rows
    .map((row) => row.dateCandidate)
    .filter((d): d is string => !!d)
    .sort();
  if (rows.length === 0) {
    warnings.push("Não encontramos lançamentos com data e valor neste PDF.");
  }

  const base: ParsedDocument = {
    documentType: "bank_statement",
    sourceKind: "pdf",
    pages,
    period: {
      start: dates[0] ?? null,
      end: dates[dates.length - 1] ?? null,
    },
    openingBalance: firstAmountAfter(fullText, /saldo\s*inicial/i),
    closingBalance: firstAmountAfter(
      fullText,
      /saldo\s*(final|atual|dispon[ií]vel)/i,
    ),
    institution: analysis.institution,
    accounts: [],
    holdings: [],
    rows,
    warnings: [
      ...warnings,
      ...(analysis.institution
        ? [`Instituição identificada: ${analysis.institution.institutionName}.`]
        : []),
    ],
  };

  return applyInstitutionAdapter(base, lines, fileName);
}

/**
 * OCR local em PDF escaneado → mesmo pipeline de texto.
 * Requer `public/ocr/por.traineddata` (offline).
 */
export async function parsePdfDocumentWithOcr(
  file: File,
  options?: {
    password?: string;
    onProgress?: (p: OcrProgress) => void;
  },
): Promise<ParsedDocument> {
  const ocr = await ocrPdfFile(file, {
    password: options?.password,
    onProgress: options?.onProgress,
  });
  const lines = ocr.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.join("").replace(/\s/g, "").length < 20) {
    return {
      documentType: "bank_statement",
      sourceKind: "pdf",
      pages: ocr.pages,
      period: { start: null, end: null },
      rows: [],
      warnings: [
        "OCR local não extraiu texto suficiente. Verifique se public/ocr/por.traineddata está presente.",
      ],
      needsOcr: true,
    };
  }
  return buildParsedFromLines(lines, file.name, ocr.pages, [
    `OCR local concluído (confiança média ${(ocr.confidence * 100).toFixed(0)}%).`,
  ]);
}
