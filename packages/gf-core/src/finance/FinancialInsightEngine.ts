import { formatBrl } from "../domain/labels";
import type {
  FinancialEvidence,
  FinancialInsightItem,
  FinancialSnapshot,
  InsightSeverity,
} from "./types";
import { AI_THRESHOLDS } from "./types";

function pctLabel(ratio: number | null): string {
  if (ratio === null) return "n/d";
  return `${(ratio * 100).toFixed(1).replace(".", ",")}%`;
}

export function buildEvidence(partial: FinancialEvidence): FinancialEvidence {
  return partial;
}

/**
 * Insights determinísticos com evidências verificáveis.
 */
export function buildFinancialInsights(
  fs: FinancialSnapshot,
): FinancialInsightItem[] {
  const out: FinancialInsightItem[] = [];

  if (fs.cashFlow.surplus !== 0) {
    out.push({
      id: "month-surplus",
      type: fs.cashFlow.surplus >= 0 ? "positive_trend" : "attention",
      title:
        fs.cashFlow.surplus >= 0
          ? "Mês com saldo positivo"
          : "Mês com saldo negativo",
      summary: `O saldo do mês foi ${formatBrl(fs.cashFlow.surplus)}.`,
      evidence: [
        buildEvidence({
          metric: "surplus",
          label: "Saldo do mês",
          current: fs.cashFlow.surplus,
          period: fs.period.currentMonth,
          details: [
            `Renda: ${formatBrl(fs.income.current)}`,
            `Gastos: ${formatBrl(fs.expenses.current)}`,
          ],
        }),
      ],
      severity: fs.cashFlow.surplus >= 0 ? "info" : "attention",
      relatedMetric: "cashFlow.surplus",
      source: "cashFlow",
    });
  }

  if (fs.netWorth.variation12m !== null && Math.abs(fs.netWorth.variation12m) >= 0.01) {
    const up = fs.netWorth.variation12m >= 0;
    out.push({
      id: "networth-trend",
      type: up ? "positive_trend" : "attention",
      title: up ? "Patrimônio em crescimento" : "Patrimônio em queda",
      summary: `Seu patrimônio líquido mudou ${pctLabel(fs.netWorth.variation12m)} no histórico recente.`,
      evidence: [
        buildEvidence({
          metric: "netWorth",
          label: "Patrimônio líquido",
          current: fs.netWorth.current,
          variation: fs.netWorth.variation12m,
          period: "histórico registrado",
        }),
      ],
      severity: up ? "info" : "attention",
      relatedMetric: "netWorth.current",
      source: "netWorth",
    });
  }

  const top = fs.expenses.byCategory[0];
  if (top && top.percentage >= 0.15) {
    out.push({
      id: "top-category",
      type: "concentration",
      title: "Concentração de gastos",
      summary: `${top.category} representa ${pctLabel(top.percentage)} dos gastos deste mês.`,
      evidence: [
        buildEvidence({
          metric: "topCategory",
          label: top.category,
          current: top.amount,
          period: fs.period.currentMonth,
          details: [`Participação: ${pctLabel(top.percentage)}`],
        }),
      ],
      severity: "info",
      relatedMetric: "expenses.byCategory",
      source: "expenses",
    });
  }

  for (const cat of fs.expenses.byCategory.slice(0, 5)) {
    if (
      cat.variation !== null &&
      cat.variation >= AI_THRESHOLDS.expenseSpikeRatio
    ) {
      out.push({
        id: `cat-spike-${cat.category}`,
        type: "expense_spike",
        title: `${cat.category} acima da média`,
        summary: `${cat.category} ficou ${pctLabel(cat.variation)} acima da média dos meses anteriores.`,
        evidence: [
          buildEvidence({
            metric: "categoryExpense",
            label: cat.category,
            current: cat.amount,
            variation: cat.variation,
            period: "média dos meses anteriores",
            details: [
              `Atual: ${formatBrl(cat.amount)}`,
              `Variação: ${pctLabel(cat.variation)}`,
            ],
          }),
        ],
        severity: "attention",
        relatedMetric: "expenses.byCategory",
        source: "expenses",
      });
    }
  }

  for (const goal of fs.goals.slice(0, 4)) {
    if (goal.progress >= 0.5 && goal.progress < 1 && goal.remaining > 0) {
      out.push({
        id: `goal-${goal.name}`,
        type: "goal_progress",
        title: `Meta: ${goal.name}`,
        summary: `${pctLabel(goal.progress)} concluída — faltam ${formatBrl(goal.remaining)}.`,
        evidence: [
          buildEvidence({
            metric: "goal",
            label: goal.name,
            current: goal.current,
            baseline: goal.target,
            details: [
              `Progresso: ${pctLabel(goal.progress)}`,
              goal.requiredMonthly != null
                ? `Aporte necessário: ${formatBrl(goal.requiredMonthly)}/mês`
                : "Prazo não definido",
            ],
          }),
        ],
        severity: "info",
        relatedMetric: "goals",
        source: "goals",
      });
    }
  }

  if (fs.investments.total > 0 && fs.investments.concentrationPct != null) {
    out.push({
      id: "portfolio-composition",
      type: "portfolio",
      title: "Composição da carteira",
      summary: `Patrimônio investido de ${formatBrl(fs.investments.total)}${
        fs.investments.concentrationClass
          ? `, com maior parcela em ${fs.investments.concentrationClass} (${fs.investments.concentrationPct.toFixed(0)}%).`
          : "."
      }`,
      evidence: [
        buildEvidence({
          metric: "investments",
          label: "Patrimônio investido",
          current: fs.investments.total,
          details: fs.investments.allocation.slice(0, 6).map(
            (a) =>
              `${a.class}: ${pctLabel(a.percentage)} · ${formatBrl(a.amount)}`,
          ),
        }),
      ],
      severity: "info",
      relatedMetric: "investments.total",
      source: "investments",
    });
  }

  return out.slice(0, 12);
}

export function severityLabel(s: InsightSeverity): string {
  if (s === "warning") return "Merece atenção";
  if (s === "attention") return "Fique de olho";
  return "Informativo";
}
