import { parseBrAmount } from "@/adapters/bank-import";
import type { ParsedDocument, ParsedDocumentRow } from "../types";

const DATE_RE =
  /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;
const AMOUNT_RE =
  /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})/g;

function toIso(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateCandidate(text: string): string | null {
  DATE_RE.lastIndex = 0;
  const m = DATE_RE.exec(text);
  if (!m) return null;
  if (m[4]) return `${m[4]}-${m[5]}-${m[6]}`;
  return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
}

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
  // Heurística: valores em extratos BR de gastos costumam ser positivos no texto
  // mas representam saídas se houver palavras de compra; senão manter sinal do parse
  return amount;
}

/**
 * Extrai texto de PDF via pdfjs e identifica linhas com data/valor.
 * Isolado — não acessa cofre/PIN.
 */
export async function parsePdfDocument(file: File): Promise<ParsedDocument> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = doc.numPages;
  const pageTexts: string[] = [];
  let totalChars = 0;

  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? String(it.str) : ""))
      .join(" ");
    pageTexts.push(text);
    totalChars += text.replace(/\s/g, "").length;
  }

  const fullText = pageTexts.join("\n");
  if (totalChars < 40) {
    return {
      documentType: "bank_statement",
      sourceKind: "pdf",
      pages,
      period: { start: null, end: null },
      rows: [],
      warnings: [
        "Este PDF parece conter imagens em vez de texto. OCR local não está disponível.",
      ],
      needsOcr: true,
    };
  }

  const lines = fullText
    .split(/\n|(?=\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 6);

  const rows: ParsedDocumentRow[] = [];
  let idx = 0;
  for (const line of lines) {
    const date = parseDateCandidate(line);
    const amountRaw = parseAmountCandidate(line);
    if (!date && amountRaw === null) continue;
    if (amountRaw === null) continue;
    const signed = inferSign(line, amountRaw);
    const desc = stripAmountAndDate(line).slice(0, 200) || "Lançamento";
    idx += 1;
    rows.push({
      id: `row-${String(idx).padStart(3, "0")}`,
      rawText: line.slice(0, 400),
      dateCandidate: date,
      amountCandidate: signed,
      descriptionCandidate: desc,
      typeHint: signed < 0 ? "expense" : "income",
    });
  }

  // Dedup por rawText+date+amount
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = `${r.dateCandidate}|${r.amountCandidate}|${r.descriptionCandidate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const dates = unique
    .map((r) => r.dateCandidate)
    .filter((d): d is string => !!d)
    .sort();

  const opening = extractBalance(fullText, /saldo\s*inicial/i);
  const closing = extractBalance(
    fullText,
    /saldo\s*(final|atual|dispon[ií]vel)/i,
  );

  return {
    documentType: "bank_statement",
    sourceKind: "pdf",
    pages,
    period: {
      start: dates[0] ?? null,
      end: dates[dates.length - 1] ?? null,
    },
    openingBalance: opening,
    closingBalance: closing,
    rows: unique,
    warnings:
      unique.length === 0
        ? ["Não encontramos lançamentos com data e valor neste PDF."]
        : [],
  };
}

function extractBalance(text: string, label: RegExp): number | null {
  const idx = text.search(label);
  if (idx < 0) return null;
  const slice = text.slice(idx, idx + 80);
  return parseAmountCandidate(slice);
}
