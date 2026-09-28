import { formatBrl } from "@/domain/labels";
import type { FinancialSnapshot } from "./types";

export type BudgetObjective =
  | "increase_contribution"
  | "pay_debts"
  | "reach_goal"
  | "increase_reserve";

export interface BudgetOpportunity {
  id: string;
  title: string;
  summary: string;
  category?: string;
  potentialMonthly?: number;
  evidence: string[];
}

/**
 * Sugere possibilidades de ajuste — sem impor cortes.
 */
export function analyzeBudgetOpportunities(
  fs: FinancialSnapshot,
  objective: BudgetObjective = "increase_contribution",
): {
  objective: BudgetObjective;
  summary: string;
  opportunities: BudgetOpportunity[];
} {
  const opportunities: BudgetOpportunity[] = [];
  const variableCats = fs.expenses.byCategory
    .filter((c) => c.percentage >= 0.08)
    .slice(0, 5);

  for (const cat of variableCats) {
    const trim = Math.round(cat.amount * 0.1 * 100) / 100;
    if (trim < 50) continue;
    opportunities.push({
      id: `trim-${cat.category}`,
      title: `Espaço em ${cat.category}`,
      summary: `${cat.category} representa ${(cat.percentage * 100).toFixed(0)}% dos gastos (${formatBrl(cat.amount)}). Uma redução de cerca de 10% liberaria ~${formatBrl(trim)}/mês — se fizer sentido para você.`,
      category: cat.category,
      potentialMonthly: trim,
      evidence: [
        `Atual: ${formatBrl(cat.amount)}`,
        `Participação: ${(cat.percentage * 100).toFixed(0)}%`,
        `Simulação −10%: ${formatBrl(trim)}/mês`,
      ],
    });
  }

  if (fs.debts.monthlyPayments > 0 && objective === "pay_debts") {
    opportunities.push({
      id: "debt-focus",
      title: "Parcelas de dívidas",
      summary: `Há ${formatBrl(fs.debts.monthlyPayments)}/mês em parcelas de dívidas (saldo ${formatBrl(fs.debts.total)}). Avaliar quitação antecipada ou aumento de parcela é uma possibilidade — use o simulador.`,
      potentialMonthly: fs.debts.monthlyPayments,
      evidence: [
        `Saldo: ${formatBrl(fs.debts.total)}`,
        `Parcelas: ${formatBrl(fs.debts.monthlyPayments)}/mês`,
      ],
    });
  }

  if (fs.goals[0] && (objective === "reach_goal" || objective === "increase_contribution")) {
    const g = fs.goals[0];
    if (g.requiredMonthly != null) {
      const gap = Math.max(0, g.requiredMonthly - Math.max(0, fs.cashFlow.surplus));
      opportunities.push({
        id: "goal-gap",
        title: `Ritmo para ${g.name}`,
        summary:
          gap > 0
            ? `Para a meta no prazo, o sistema calcula ~${formatBrl(g.requiredMonthly)}/mês. A sobra atual é ${formatBrl(fs.cashFlow.surplus)} — diferença de ~${formatBrl(gap)}.`
            : `Com a sobra atual (${formatBrl(fs.cashFlow.surplus)}), o aporte necessário (${formatBrl(g.requiredMonthly)}/mês) está coberto neste mês.`,
        potentialMonthly: gap || g.requiredMonthly,
        evidence: [
          `Meta: ${formatBrl(g.current)} / ${formatBrl(g.target)}`,
          `Aporte necessário: ${formatBrl(g.requiredMonthly)}`,
          `Sobra do mês: ${formatBrl(fs.cashFlow.surplus)}`,
        ],
      });
    }
  }

  if (objective === "increase_reserve" && fs.cashFlow.savingsRate !== null) {
    opportunities.push({
      id: "reserve",
      title: "Capacidade de reserva",
      summary: `Taxa de poupança deste mês: ${((fs.cashFlow.savingsRate ?? 0) * 100).toFixed(1)}%. Revisar categorias maiores pode ampliar a reserva — sem obrigação de cortar nada específico.`,
      evidence: [
        `Sobra: ${formatBrl(fs.cashFlow.surplus)}`,
        `Taxa: ${((fs.cashFlow.savingsRate ?? 0) * 100).toFixed(1)}%`,
      ],
    });
  }

  const totalPotential = opportunities.reduce(
    (s, o) => s + (o.potentialMonthly ?? 0),
    0,
  );

  const objectiveLabel: Record<BudgetObjective, string> = {
    increase_contribution: "Aumentar aportes",
    pay_debts: "Reduzir dívidas",
    reach_goal: "Atingir meta",
    increase_reserve: "Aumentar reserva",
  };

  return {
    objective,
    summary: `Objetivo: ${objectiveLabel[objective]}. ${
      opportunities.length
        ? `Há ${opportunities.length} ponto(s) para avaliação${
            totalPotential > 0
              ? ` (potencial combinado ilustrativo ~${formatBrl(totalPotential)}/mês)`
              : ""
          }.`
        : "Não há oportunidades evidentes com os dados atuais."
    }`,
    opportunities,
  };
}
