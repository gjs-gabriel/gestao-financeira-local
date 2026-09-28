import { formatBrl } from "@/domain/labels";
import { compareDebtPlans } from "@/domain/planning";
import type { Debt } from "@/domain/types";
import type { FinancialSnapshot, ScenarioResult } from "./types";

const DISCLAIMER =
  "Simulação ilustrativa com as premissas abaixo. Não é garantia de resultado.";

/** Aporte mensal × meses (rentabilidade 0% a.m. por padrão). */
export function scenarioMonthlyContribution(input: {
  monthlyAmount: number;
  months: number;
  monthlyRate?: number;
}): ScenarioResult {
  const rate = input.monthlyRate ?? 0;
  let total = 0;
  for (let i = 0; i < input.months; i++) {
    total = (total + input.monthlyAmount) * (1 + rate);
  }
  total = Math.round(total * 100) / 100;
  return {
    id: "contrib",
    kind: "contribution",
    title: "Acúmulo com aportes mensais",
    premises: [
      { label: "Aporte mensal", value: formatBrl(input.monthlyAmount) },
      { label: "Prazo", value: `${input.months} meses` },
      {
        label: "Rentabilidade considerada",
        value: `${(rate * 100).toFixed(2).replace(".", ",")}% ao mês`,
      },
    ],
    results: [{ label: "Resultado estimado", value: formatBrl(total) }],
    disclaimer: DISCLAIMER,
    raw: { total, months: input.months, monthlyAmount: input.monthlyAmount },
  };
}

export function scenarioGoalRequired(input: {
  goalName: string;
  remaining: number;
  months: number;
}): ScenarioResult {
  const months = Math.max(1, input.months);
  const monthly = Math.round((input.remaining / months) * 100) / 100;
  return {
    id: "goal-required",
    kind: "goal",
    title: `Aporte para meta: ${input.goalName}`,
    premises: [
      { label: "Valor restante", value: formatBrl(input.remaining) },
      { label: "Prazo", value: `${months} meses` },
      { label: "Rentabilidade considerada", value: "0% ao mês" },
    ],
    results: [
      { label: "Aporte mensal necessário", value: formatBrl(monthly) },
    ],
    disclaimer: DISCLAIMER,
    raw: { monthly, remaining: input.remaining, months },
  };
}

export function scenarioExpenseCut(input: {
  currentSurplus: number;
  cutMonthly: number;
  months: number;
}): ScenarioResult {
  const newSurplus = input.currentSurplus + input.cutMonthly;
  const extra = input.cutMonthly * input.months;
  return {
    id: "expense-cut",
    kind: "expenses",
    title: "Redução de gastos",
    premises: [
      { label: "Redução mensal", value: formatBrl(input.cutMonthly) },
      { label: "Prazo", value: `${input.months} meses` },
      { label: "Sobra atual", value: formatBrl(input.currentSurplus) },
    ],
    results: [
      { label: "Nova sobra mensal (ilustrativa)", value: formatBrl(newSurplus) },
      {
        label: "Capacidade extra no período",
        value: formatBrl(extra),
      },
    ],
    disclaimer: DISCLAIMER,
    raw: { newSurplus, extra },
  };
}

export function scenarioIncomeChange(input: {
  currentIncome: number;
  currentExpenses: number;
  incomeDeltaRatio: number;
}): ScenarioResult {
  const newIncome = Math.round(input.currentIncome * (1 + input.incomeDeltaRatio) * 100) / 100;
  const newSurplus = newIncome - input.currentExpenses;
  return {
    id: "income-change",
    kind: "income",
    title: "Mudança de renda",
    premises: [
      {
        label: "Variação de renda",
        value: `${(input.incomeDeltaRatio * 100).toFixed(0)}%`,
      },
      { label: "Renda atual", value: formatBrl(input.currentIncome) },
      { label: "Gastos mantidos", value: formatBrl(input.currentExpenses) },
    ],
    results: [
      { label: "Nova renda", value: formatBrl(newIncome) },
      { label: "Nova sobra", value: formatBrl(newSurplus) },
    ],
    disclaimer: DISCLAIMER,
    raw: { newIncome, newSurplus },
  };
}

export function scenarioDebtPayoff(
  debt: Debt,
  extraMonthly: number,
): ScenarioResult | null {
  if (!debt.installmentAmount || debt.installmentAmount <= 0) return null;
  const comparison = compareDebtPlans(debt, Math.max(0, extraMonthly));
  return {
    id: `debt-${debt.name}`,
    kind: "debt",
    title: `Quitação: ${debt.name}`,
    premises: [
      { label: "Saldo", value: formatBrl(debt.balance) },
      { label: "Parcela", value: formatBrl(debt.installmentAmount) },
      { label: "Extra mensal", value: formatBrl(extraMonthly) },
      {
        label: "Taxa usada",
        value:
          debt.interestRate != null
            ? `${debt.interestRate}% a.a.`
            : "não informada (simulação simplificada)",
      },
    ],
    results: [
      {
        label: "Sem extra",
        value: `${comparison.base.months} meses · juros ${formatBrl(comparison.base.totalInterest)}`,
      },
      {
        label: "Com extra",
        value: `${comparison.withExtra.months} meses · juros ${formatBrl(comparison.withExtra.totalInterest)}`,
      },
      {
        label: "Economia",
        value: `${comparison.monthsSaved} mês(es) · ${formatBrl(comparison.interestSaved)}`,
      },
    ],
    disclaimer: DISCLAIMER,
    raw: {
      monthsSaved: comparison.monthsSaved,
      interestSaved: comparison.interestSaved,
    },
  };
}

export function scenarioNetWorthPath(input: {
  current: number;
  monthlySurplus: number;
  months: number;
}): ScenarioResult {
  const projected =
    Math.round((input.current + input.monthlySurplus * input.months) * 100) /
    100;
  return {
    id: "networth-path",
    kind: "netWorth",
    title: "Evolução patrimonial ilustrativa",
    premises: [
      { label: "Patrimônio atual", value: formatBrl(input.current) },
      {
        label: "Sobra mensal assumida",
        value: formatBrl(input.monthlySurplus),
      },
      { label: "Prazo", value: `${input.months} meses` },
      { label: "Rentabilidade", value: "0% (só aportes da sobra)" },
    ],
    results: [
      { label: "Patrimônio estimado", value: formatBrl(projected) },
      {
        label: "Variação",
        value: formatBrl(projected - input.current),
      },
    ],
    disclaimer: DISCLAIMER,
    raw: { projected },
  };
}

/** Atalhos a partir do FinancialSnapshot. */
export function runCommonScenarios(fs: FinancialSnapshot): ScenarioResult[] {
  const results: ScenarioResult[] = [];
  const topGoal = fs.goals[0];
  if (topGoal && topGoal.remaining > 0) {
    const months = topGoal.deadlineMonths ?? 36;
    results.push(
      scenarioGoalRequired({
        goalName: topGoal.name,
        remaining: topGoal.remaining,
        months,
      }),
    );
    if (fs.cashFlow.surplus > 0) {
      results.push(
        scenarioMonthlyContribution({
          monthlyAmount: Math.round(fs.cashFlow.surplus),
          months,
        }),
      );
    }
  } else {
    results.push(
      scenarioMonthlyContribution({
        monthlyAmount: 2000,
        months: 36,
      }),
    );
  }
  results.push(
    scenarioExpenseCut({
      currentSurplus: fs.cashFlow.surplus,
      cutMonthly: 500,
      months: 12,
    }),
  );
  results.push(
    scenarioNetWorthPath({
      current: fs.netWorth.current,
      monthlySurplus: Math.max(0, fs.cashFlow.surplus),
      months: 12,
    }),
  );
  return results;
}
