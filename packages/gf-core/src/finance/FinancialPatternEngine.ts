import { formatBrl } from "../domain/labels";
import type { FinancialInsightItem, FinancialSnapshot } from "./types";
import { AI_THRESHOLDS } from "./types";

/**
 * Padrões comportamentais — só declara com histórico suficiente.
 */
export function buildFinancialPatterns(
  fs: FinancialSnapshot,
): FinancialInsightItem[] {
  const out: FinancialInsightItem[] = [];
  const months = fs.history.months;

  if (months.length < AI_THRESHOLDS.minHistoryMonthsForPattern) {
    out.push({
      id: "pattern-insufficient",
      type: "limitation",
      title: "Histórico insuficiente",
      summary:
        "Não há histórico suficiente para identificar um padrão confiável.",
      evidence: [
        {
          metric: "historyLength",
          label: "Meses disponíveis",
          current: months.length,
          details: [
            `Mínimo sugerido: ${AI_THRESHOLDS.minHistoryMonthsForPattern}`,
          ],
        },
      ],
      severity: "info",
      relatedMetric: "history",
      source: "patterns",
    });
    return out;
  }

  const avgExp =
    months.reduce((s, m) => s + m.expenses, 0) / months.length;
  const above = months.filter((m) => m.expenses > avgExp * 1.05);
  if (above.length >= Math.ceil(months.length * 0.5)) {
    out.push({
      id: "pattern-expenses-high",
      type: "pattern",
      title: "Gastos frequentemente acima da média",
      summary: `Os gastos ficaram acima da média em ${above.length} de ${months.length} meses analisados.`,
      evidence: [
        {
          metric: "expensesAboveAvg",
          label: "Meses acima da média",
          current: above.length,
          baseline: months.length,
          details: [
            `Média de gastos: ${formatBrl(avgExp)}`,
            ...above.slice(-4).map((m) => `${m.month}: ${formatBrl(m.expenses)}`),
          ],
        },
      ],
      severity: "attention",
      relatedMetric: "expenses",
      source: "patterns",
    });
  }

  const firstHalf = months.slice(0, Math.floor(months.length / 2));
  const secondHalf = months.slice(Math.floor(months.length / 2));
  if (firstHalf.length >= 2 && secondHalf.length >= 2) {
    const avgInc1 =
      firstHalf.reduce((s, m) => s + m.income, 0) / firstHalf.length;
    const avgInc2 =
      secondHalf.reduce((s, m) => s + m.income, 0) / secondHalf.length;
    const avgExp1 =
      firstHalf.reduce((s, m) => s + m.expenses, 0) / firstHalf.length;
    const avgExp2 =
      secondHalf.reduce((s, m) => s + m.expenses, 0) / secondHalf.length;
    if (avgInc1 > 0 && avgExp1 > 0) {
      const incomeGrowth = (avgInc2 - avgInc1) / avgInc1;
      const expenseGrowth = (avgExp2 - avgExp1) / avgExp1;
      if (Math.abs(incomeGrowth) >= 0.05 || Math.abs(expenseGrowth) >= 0.05) {
        out.push({
          id: "pattern-income-vs-expense",
          type: "pattern",
          title: "Renda vs gastos no período",
          summary: `Na segunda metade do histórico, a renda mudou ${(incomeGrowth * 100).toFixed(0)}% e os gastos ${(expenseGrowth * 100).toFixed(0)}% em relação à primeira metade.`,
          evidence: [
            {
              metric: "incomeVsExpenseTrend",
              label: "Tendência comparada",
              details: [
                `Renda (1ª metade): ${formatBrl(avgInc1)}`,
                `Renda (2ª metade): ${formatBrl(avgInc2)}`,
                `Gastos (1ª metade): ${formatBrl(avgExp1)}`,
                `Gastos (2ª metade): ${formatBrl(avgExp2)}`,
              ],
            },
          ],
          severity:
            expenseGrowth > incomeGrowth + 0.05 ? "attention" : "info",
          relatedMetric: "history",
          source: "patterns",
        });
      }
    }
  }

  for (const cat of fs.expenses.byCategory.slice(0, 3)) {
    if (cat.variation !== null && Math.abs(cat.variation) >= 0.1) {
      out.push({
        id: `pattern-cat-${cat.category}`,
        type: "pattern",
        title: `Movimento em ${cat.category}`,
        summary: `${cat.category} está ${(cat.variation * 100).toFixed(0)}% ${cat.variation >= 0 ? "acima" : "abaixo"} da média recente.`,
        evidence: [
          {
            metric: "categoryTrend",
            label: cat.category,
            current: cat.amount,
            variation: cat.variation,
            period: fs.period.currentMonth,
          },
        ],
        severity: cat.variation >= 0.15 ? "attention" : "info",
        relatedMetric: "expenses.byCategory",
        source: "patterns",
      });
    }
  }

  const savings = months
    .filter((m) => m.income > 0)
    .map((m) => m.surplus / m.income);
  if (savings.length >= AI_THRESHOLDS.minHistoryMonthsForPattern) {
    const recent = savings.slice(-3);
    const older = savings.slice(0, -3);
    if (older.length >= 2) {
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
      const drop = avgOlder - avgRecent;
      if (drop >= AI_THRESHOLDS.savingsDropPoints) {
        out.push({
          id: "pattern-savings-drop",
          type: "pattern",
          title: "Taxa de poupança em queda",
          summary: `A taxa de poupança média recente (${(avgRecent * 100).toFixed(0)}%) está abaixo do trecho anterior (${(avgOlder * 100).toFixed(0)}%).`,
          evidence: [
            {
              metric: "savingsRate",
              label: "Taxa de poupança",
              current: avgRecent,
              baseline: avgOlder,
              variation: -drop,
            },
          ],
          severity: "attention",
          relatedMetric: "cashFlow.savingsRate",
          source: "patterns",
        });
      }
    }
  }

  return out.slice(0, 10);
}
