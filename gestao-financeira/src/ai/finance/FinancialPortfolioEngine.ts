import { formatBrl } from "@/domain/labels";
import type { FinancialSnapshot } from "./types";
import { AI_THRESHOLDS } from "./types";

export interface PortfolioAnalysis {
  summary: string;
  allocation: { class: string; percentage: number; amount: number }[];
  concentrationNote: string | null;
  goalsNote: string | null;
  debtsNote: string | null;
  liquidityNote: string | null;
  pointsToEvaluate: string[];
}

/**
 * Análise descritiva da carteira — sem buy/sell.
 */
export function analyzePortfolioForAI(fs: FinancialSnapshot): PortfolioAnalysis {
  const allocation = fs.investments.allocation.map((a) => ({
    class: a.class,
    percentage: a.percentage,
    amount: a.amount,
  }));

  let concentrationNote: string | null = null;
  if (
    fs.investments.concentrationPct != null &&
    fs.investments.concentrationPct >= AI_THRESHOLDS.concentrationPct &&
    fs.investments.concentrationClass
  ) {
    concentrationNote = `Há concentração relevante em ${fs.investments.concentrationClass} (${fs.investments.concentrationPct.toFixed(0)}%). Isso não é automaticamente bom ou ruim — vale comparar com o prazo das suas metas.`;
  }

  let goalsNote: string | null = null;
  const shortGoal = fs.goals.find(
    (g) => g.deadlineMonths !== null && g.deadlineMonths <= 24 && g.remaining > 0,
  );
  if (shortGoal) {
    goalsNote = `Você tem a meta "${shortGoal.name}" com horizonte de até ${shortGoal.deadlineMonths} meses e ${formatBrl(shortGoal.remaining)} restantes. Vale avaliar se a liquidez da carteira está alinhada a esse prazo.`;
  }

  let debtsNote: string | null = null;
  if (fs.debts.total > 0 && fs.investments.total > 0) {
    const ratio = fs.debts.total / fs.investments.total;
    debtsNote = `Dívidas (${formatBrl(fs.debts.total)}) equivalem a ${(ratio * 100).toFixed(0)}% do valor investido (${formatBrl(fs.investments.total)}). Relação informativa — sem ordem de ação.`;
  }

  let liquidityNote: string | null = null;
  if (fs.commitments.next30Days > 0) {
    liquidityNote = `Compromissos previstos em 30 dias: ${formatBrl(fs.commitments.next30Days)}. Patrimônio líquido atual: ${formatBrl(fs.netWorth.current)}.`;
  }

  const pointsToEvaluate: string[] = [];
  if (concentrationNote) {
    pointsToEvaluate.push(
      "A distribuição atual está alinhada ao seu prazo e tolerância a risco?",
    );
  }
  if (goalsNote) {
    pointsToEvaluate.push(
      "Há recursos líquidos suficientes para metas de curto prazo?",
    );
  }
  if (debtsNote) {
    pointsToEvaluate.push(
      "Como o custo das dívidas se compara ao rendimento esperado dos investimentos?",
    );
  }

  const summary =
    fs.investments.total <= 0
      ? "Ainda não há aplicações cadastradas para analisar a carteira."
      : `Patrimônio investido de ${formatBrl(fs.investments.total)} distribuído em ${allocation.length} classe(s).`;

  return {
    summary,
    allocation,
    concentrationNote,
    goalsNote,
    debtsNote,
    liquidityNote,
    pointsToEvaluate,
  };
}
