"use client";

import type { FinancialAnalysis } from "@/ai/local/types";

/**
 * Renderiza o JSON estruturado do runtime — sem inferência no navegador.
 */
export function AIRuntimeAnalysisView({
  analysis,
}: {
  analysis: FinancialAnalysis;
}) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
      {analysis.summary ? (
        <p className="whitespace-pre-wrap">{analysis.summary}</p>
      ) : (
        <p className="text-muted-foreground">
          A IA local não retornou um resumo legível.
        </p>
      )}

      {analysis.insights.length > 0 ? (
        <div className="space-y-3">
          <p className="type-label">Insights da IA local</p>
          <ul className="space-y-3">
            {analysis.insights.map((item, idx) => (
              <li
                key={`${item.title}-${idx}`}
                className="border-l-2 border-primary/40 pl-3"
              >
                {item.title ? (
                  <p className="font-medium text-foreground">{item.title}</p>
                ) : null}
                {item.description ? (
                  <p className="mt-0.5 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                {item.evidence && item.evidence.length > 0 ? (
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {item.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.recommendations && analysis.recommendations.length > 0 ? (
        <div>
          <p className="type-label">Pontos de atenção</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {analysis.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.questions && analysis.questions.length > 0 ? (
        <div>
          <p className="type-label">Perguntas sugeridas</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {analysis.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        🔒 Processamento no runtime local · JSON formatado pelo aplicativo ·
        fonte: {analysis.source}
      </p>
    </div>
  );
}
