import type {
  FinancialAnalysis,
  FinancialAnalysisInsight,
  InsightImportance,
} from "./types";

/**
 * Normaliza o JSON devolvido pelo runtime local.
 * Nenhuma inferência no navegador — só parse/formatação.
 */
export function normalizeFinancialAnalysis(
  input: unknown,
  source: FinancialAnalysis["source"] = "local-runtime",
): FinancialAnalysis {
  if (typeof input === "string") {
    return coerceAnalysisFromRaw(input, { source });
  }
  if (!input || typeof input !== "object") {
    return emptyAnalysis(source);
  }

  const obj = input as Record<string, unknown>;

  // Caso o runtime tenha embutido JSON em summary por engano
  if (typeof obj.summary === "string" && looksLikeJson(obj.summary)) {
    const nested = coerceAnalysisFromRaw(obj.summary, { source });
    if (nested.summary && !looksLikeJson(nested.summary)) {
      return {
        ...nested,
        insights:
          nested.insights.length > 0
            ? nested.insights
            : normalizeInsights(obj.insights),
        questions: mergeStringList(nested.questions, obj.questions),
        recommendations: mergeStringList(
          nested.recommendations,
          obj.recommendations,
        ),
        source,
      };
    }
  }

  return {
    summary: cleanProse(String(obj.summary ?? "")).slice(0, 2000),
    insights: normalizeInsights(obj.insights),
    questions: asStringList(obj.questions, 5, 160),
    recommendations: asStringList(obj.recommendations, 5, 200),
    source,
  };
}

/**
 * Converte a resposta do runtime (JSON) em prosa legível quando a UI
 * precisa de uma string (ex.: chat). Preferir renderizar a estrutura.
 */
export function formatAnalysisForDisplay(
  analysis: FinancialAnalysis | string,
): string {
  const parsed = normalizeFinancialAnalysis(analysis);
  const parts: string[] = [];

  if (parsed.summary) parts.push(parsed.summary.trim());

  if (parsed.insights.length > 0) {
    parts.push(
      parsed.insights
        .map((i) => formatInsightLine(i))
        .filter(Boolean)
        .join("\n"),
    );
  }

  const recommendations = parsed.recommendations ?? [];
  if (recommendations.length > 0) {
    parts.push(
      "Pontos de atenção:\n" +
        recommendations.map((r) => `• ${r}`).join("\n"),
    );
  }

  const questions = parsed.questions ?? [];
  if (questions.length > 0) {
    parts.push(
      "Perguntas sugeridas:\n" + questions.map((q) => `• ${q}`).join("\n"),
    );
  }

  return (
    parts.filter(Boolean).join("\n\n").trim() ||
    "Não foi possível interpretar a resposta da IA local."
  );
}

/** Se o chat devolver JSON cru, extrai o texto útil. */
export function formatChatTextForDisplay(text: string): string {
  const trimmed = text.trim();
  if (!looksLikeJson(trimmed) && !trimmed.startsWith("```")) {
    return cleanProse(trimmed);
  }
  return formatAnalysisForDisplay(trimmed);
}

function formatInsightLine(i: FinancialAnalysisInsight): string {
  const title = i.title?.trim();
  const desc = i.description?.trim();
  if (title && desc) return `• ${title}: ${desc}`;
  if (title) return `• ${title}`;
  if (desc) return `• ${desc}`;
  return "";
}

function emptyAnalysis(source: FinancialAnalysis["source"]): FinancialAnalysis {
  return {
    summary: "",
    insights: [],
    questions: [],
    recommendations: [],
    source,
  };
}

function coerceAnalysisFromRaw(
  raw: string,
  opts?: { source?: FinancialAnalysis["source"] },
): FinancialAnalysis {
  const source = opts?.source ?? "local-runtime";
  const empty = emptyAnalysis(source);
  const cleaned = stripCodeFence(raw).trim();
  if (!cleaned) return empty;

  if (!looksLikeJson(cleaned)) {
    return { ...empty, summary: cleanProse(cleaned).slice(0, 2000) };
  }

  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    return normalizeFinancialAnalysis(obj, source);
  } catch {
    const summary = extractJsonStringField(cleaned, "summary");
    return {
      ...empty,
      summary: cleanProse(
        summary || stripJsonArtifacts(cleaned),
      ).slice(0, 2000),
      insights: extractInsightsLoose(cleaned),
    };
  }
}

function normalizeInsights(value: unknown): FinancialAnalysisInsight[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      type: typeof i.type === "string" ? i.type : undefined,
      severity:
        i.severity === "warning" || i.severity === "attention"
          ? (i.severity as FinancialAnalysisInsight["severity"])
          : ("info" as const),
      importance: ((): InsightImportance | undefined => {
        if (
          i.importance === "low" ||
          i.importance === "medium" ||
          i.importance === "high"
        ) {
          return i.importance;
        }
        return undefined;
      })(),
      title: cleanProse(String(i.title ?? "")).slice(0, 160),
      description: cleanProse(String(i.description ?? "")).slice(0, 800),
      evidence: Array.isArray(i.evidence)
        ? i.evidence.map((e) => cleanProse(String(e))).slice(0, 5)
        : undefined,
    }))
    .filter((i) => i.title || i.description)
    .slice(0, 8);
}

function asStringList(value: unknown, max: number, len: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((q) => cleanProse(String(q)).slice(0, len))
    .filter(Boolean)
    .slice(0, max);
}

function mergeStringList(a: string[] | undefined, b: unknown): string[] {
  const left = a ?? [];
  const right = asStringList(b, 5, 200);
  return (left.length ? left : right).slice(0, 5);
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[") || t.startsWith("```");
}

/** Remove aspas/chaves residuais se summary ainda parecer envelope. */
function cleanProse(text: string): string {
  let t = text.trim();
  if (looksLikeJson(t) && t.includes('"summary"')) {
    const extracted = extractJsonStringField(t, "summary");
    if (extracted) t = extracted;
  }
  return t
    .replace(/^["'{{\[]+\s*/, "")
    .replace(/\s*["'}}\]]+$/, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();
}

function stripCodeFence(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return fence ? fence[1] : text;
}

/** Extrai campo string de JSON parcial/truncado. */
export function extractJsonStringField(
  raw: string,
  field: string,
): string | null {
  const re = new RegExp(
    `"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
    "s",
  );
  const m = re.exec(raw);
  if (m) return unescapeJsonString(m[1]).trim();

  const open = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, "s");
  const partial = open.exec(raw);
  if (partial?.[1]) {
    return unescapeJsonString(partial[1]).replace(/\s+\S*$/, "").trim();
  }
  return null;
}

function extractInsightsLoose(raw: string): FinancialAnalysisInsight[] {
  const block = /"insights"\s*:\s*\[([\s\S]*)/.exec(raw);
  if (!block) return [];
  const titles = [
    ...block[1].matchAll(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/g),
  ].map((m) => unescapeJsonString(m[1]));
  const descs = [
    ...block[1].matchAll(/"description"\s*:\s*"((?:\\.|[^"\\])*)"/g),
  ].map((m) => unescapeJsonString(m[1]));
  const out: FinancialAnalysisInsight[] = [];
  for (let i = 0; i < Math.min(titles.length, 8); i++) {
    out.push({
      title: titles[i],
      description: descs[i] ?? "",
    });
  }
  return out;
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\t/g, "\t");
}

function stripJsonArtifacts(raw: string): string {
  return raw
    .replace(/^\{+\s*"summary"\s*:\s*"/i, "")
    .replace(/"\s*,\s*"insights"[\s\S]*$/i, "")
    .replace(/["{}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
