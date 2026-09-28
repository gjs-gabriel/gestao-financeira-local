/**
 * Classifica intenção da pergunta do usuário para ContextSelector + engines.
 * Heurística local — sem LLM.
 */

import type { AIContextIntent } from "../finance/types";

export function classifyQuestionIntent(question: string): AIContextIntent {
  const q = question
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  if (
    /simulat|cenario|guardar|aportar|se eu|quanto preciso|atingir|quitar|reduzir.*gasto|renda cair|aumentar.*aporte/.test(
      q,
    )
  ) {
    return "scenario";
  }
  if (/carteira|invest|aloca|aplicacao|fii|etf|acao|renda fixa/.test(q)) {
    return "investments";
  }
  if (/divida|parcela|financi|emprest/.test(q)) return "debts";
  if (/meta|objetivo|reserva de emergencia|apartamento/.test(q)) return "goals";
  if (/orcamento|cortar|economizar|oportunidad/.test(q)) return "budget";
  if (/alerta|atencao|fique de olho|risco/.test(q)) return "alerts";
  if (/padrao|tendencia|aumentou|diminuiu|ultimos \d+ meses/.test(q)) {
    return "patterns";
  }
  if (/patrimonio|pl\b|riqueza|ativos|passivos/.test(q)) return "netWorth";
  if (/renda|salario|entrada|recebi/.test(q)) return "income";
  if (/gasto|despesa|categoria|para onde|alimentacao|maior/.test(q)) {
    return "expenses";
  }
  if (/fluxo|sobra|poupan|compromet/.test(q)) return "cashflow";
  if (/como (esta|está|foi)|panorama|situacao|resumo|mes\b/.test(q)) {
    return "overview";
  }
  return "chat";
}

export function extractScenarioParams(question: string): {
  monthlyAmount?: number;
  months?: number;
  cutAmount?: number;
  incomeDeltaRatio?: number;
  extraDebtPayment?: number;
} {
  const out: ReturnType<typeof extractScenarioParams> = {};
  const money =
    /r\$\s*([\d.]+(?:,\d{2})?)|([\d.]+(?:,\d{2})?)\s*(?:reais|\/mês|\/mes)/i.exec(
      question,
    );
  if (money) {
    const raw = (money[1] ?? money[2] ?? "").replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    if (!Number.isNaN(n)) out.monthlyAmount = n;
  }
  const months = /(\d+)\s*meses?/i.exec(question);
  if (months) out.months = Number(months[1]);
  if (/cair\s*(\d+)\s*%|queda\s*de\s*(\d+)\s*%/i.test(question)) {
    const m = /(?:cair|queda de)\s*(\d+)\s*%/i.exec(question);
    if (m) out.incomeDeltaRatio = -Number(m[1]) / 100;
  }
  if (/aumentar?\s*(?:meus\s*)?aportes?/i.test(question) && out.monthlyAmount) {
    /* already set */
  }
  if (/reduzir.*?(\d+)/i.test(question) && out.monthlyAmount) {
    out.cutAmount = out.monthlyAmount;
  }
  return out;
}
