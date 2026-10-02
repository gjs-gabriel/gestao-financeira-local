import { sanitizeImportString } from "@/security/gfin-guard";

export interface PdfTextItem {
  str: string;
  transform: number[];
}

/**
 * Agrupa itens do pdf.js por linha (mesma coordenada Y) e ordena da esquerda
 * para a direita. PDFs de banco quebram células; juntar só com espaço perde colunas.
 */
export function groupTextItemsIntoLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];

  for (const it of items) {
    const s = sanitizeImportString(it.str, 500);
    if (!s) continue;
    const y = it.transform[5] ?? 0;
    const x = it.transform[4] ?? 0;
    let row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, s });
  }

  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
}
