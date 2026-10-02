/**
 * Normalização de nomes de investimentos / descrições.
 * Sempre preservar raw_name; normalized_name é só para matching.
 */

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bfif\b/gi, "FIC"],
  [/\bfia\b/gi, "FIA"],
  [/\bfii\b/gi, "FII"],
  [/\betf\b/gi, "ETF"],
  [/\brenda\s+fi\b/gi, "RENDA FIXA"],
  [/\brenda\s+fixa\b/gi, "RENDA FIXA"],
  [/\brenda\s+variavel\b/gi, "RENDA VARIAVEL"],
  [/\brenda\s+variável\b/gi, "RENDA VARIAVEL"],
  [/\bref\s+di\b/gi, "REF DI"],
  [/\bresp\.?\s*ltda\.?\b/gi, ""],
  [/\bcnpj[:\s]*[\d./-]+/gi, ""],
  [/\s+-\s*$/g, ""],
];

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Normaliza nome de produto financeiro para comparação. */
export function normalizeInvestmentName(raw: string): string {
  let s = stripAccents(normalizeWhitespace(raw)).toUpperCase();
  for (const [re, rep] of ABBREVIATIONS) {
    s = s.replace(re, rep);
  }
  s = s.replace(/[^\w\s%/.-]/g, " ");
  return normalizeWhitespace(s);
}

export function normalizeDescription(raw: string): string {
  return normalizeWhitespace(stripAccents(raw).toLowerCase());
}

/** Similaridade simples 0–1 (Jaccard de tokens + inclusão). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeInvestmentName(a);
  const nb = normalizeInvestmentName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const short = Math.min(na.length, nb.length);
    const long = Math.max(na.length, nb.length);
    return Math.max(0.75, short / long);
  }
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Extrai ano de vencimento se presente (ex.: CDB 2027). */
export function extractMaturityYear(name: string): number | null {
  const m = name.match(/\b(20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100 ? y : null;
}
