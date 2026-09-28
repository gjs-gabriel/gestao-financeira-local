import { formatBrl } from "@/domain/labels";
import type {
  FinancialAlertItem,
  FinancialEvidence,
  FinancialSnapshot,
} from "./types";
import { AI_THRESHOLDS } from "./types";

function pctLabel(ratio: number | null): string {
  if (ratio === null) return "n/d";
  return `${(ratio * 100).toFixed(1).replace(".", ",")} %`;
}

/**
 * Alertas determinísticos — thresholds em AI_THRESHOLDS.
 */
export function buildFinancialAlerts(
  fs: FinancialSnapshot,
): FinancialAlertItem[] {
  const out: FinancialAlertItem[] = [];

  if (
    fs.cashFlow.commitmentRatio !== null &&
    fs.cashFlow.commitmentRatio >= AI_THRESHOLDS.commitmentWarning
  ) {
    out.push({
      id: "commitment-high",
      title: "Comprometimento da renda",
      summary: `Os gastos deste mês representam ${pctLabel(fs.cashFlow.commitmentRatio)} da renda.`,
      severity: "warning",
      evidence: [
        {
          metric: "commitmentRatio",
          label: "Renda comprometida",
          current: fs.expenses.current,
          baseline: fs.income.current,
          variation: fs.cashFlow.commitmentRatio,
          details: [
            `Gastos: ${formatBrl(fs.expenses.current)}`,
            `Renda: ${formatBrl(fs.income.current)}`,
          ],
        },
      ],
      source: "cashFlow",
    });
  } else if (
    fs.cashFlow.commitmentRatio !== null &&
    fs.cashFlow.commitmentRatio >= AI_THRESHOLDS.commitmentAttention
  ) {
    out.push({
      id: "commitment-mid",
      title: "Comprometimento elevado",
      summary: `Vale acompanhar: ${pctLabel(fs.cashFlow.commitmentRatio)} da renda já está comprometida neste mês.`,
      severity: "attention",
      evidence: [
        {
          metric: "commitmentRatio",
          label: "Renda comprometida",
          current: fs.expenses.current,
          baseline: fs.income.current,
          variation: fs.cashFlow.commitmentRatio,
        },
      ],
      source: "cashFlow",
    });
  }

  if (
    fs.income.variation !== null &&
    fs.income.variation <= -AI_THRESHOLDS.incomeDropRatio
  ) {
    out.push({
      id: "income-drop",
      title: "Renda abaixo do mês anterior",
      summary: `A renda caiu ${pctLabel(Math.abs(fs.income.variation))} em relação ao mês anterior.`,
      severity: "attention",
      evidence: [
        {
          metric: "income",
          label: "Renda do mês",
          current: fs.income.current,
          variation: fs.income.variation,
          period: fs.period.currentMonth,
        },
      ],
      source: "income",
    });
  }

  if (
    fs.expenses.variation !== null &&
    fs.expenses.variation >= AI_THRESHOLDS.expenseSpikeRatio
  ) {
    out.push({
      id: "expense-spike",
      title: "Gastos acima do mês anterior",
      summary: `Os gastos subiram ${pctLabel(fs.expenses.variation)} em relação ao mês anterior.`,
      severity: "attention",
      evidence: [
        {
          metric: "expenses",
          label: "Gastos do mês",
          current: fs.expenses.current,
          baseline: fs.expenses.monthlyAverage,
          variation: fs.expenses.variation,
        },
      ],
      source: "expenses",
    });
  }

  if (fs.income.monthlyAverage > 0) {
    const ratio = fs.commitments.next30Days / fs.income.monthlyAverage;
    if (ratio >= 0.6) {
      out.push({
        id: "commitments-30",
        title: "Compromissos futuros",
        summary: `Há ${formatBrl(fs.commitments.next30Days)} previstos nos próximos 30 dias (~${pctLabel(ratio)} da renda média).`,
        severity: ratio >= 0.85 ? "warning" : "attention",
        evidence: [
          {
            metric: "commitments30",
            label: "Próximos 30 dias",
            current: fs.commitments.next30Days,
            baseline: fs.income.monthlyAverage,
            details: [
              `90 dias: ${formatBrl(fs.commitments.next90Days)}`,
            ],
          } satisfies FinancialEvidence,
        ],
        source: "commitments",
      });
    }
  }

  for (const goal of fs.goals) {
    if (
      goal.deadlineMonths !== null &&
      goal.deadlineMonths <= 6 &&
      goal.progress < 0.8 &&
      goal.requiredMonthly != null &&
      goal.requiredMonthly > fs.cashFlow.surplus &&
      fs.cashFlow.surplus >= 0
    ) {
      out.push({
        id: `goal-risk-${goal.name}`,
        title: `Meta com prazo próximo: ${goal.name}`,
        summary: `Com o saldo atual do mês, o aporte necessário (${formatBrl(goal.requiredMonthly)}/mês) fica acima da sobra.`,
        severity: "attention",
        evidence: [
          {
            metric: "goalPace",
            label: goal.name,
            current: goal.current,
            baseline: goal.target,
            details: [
              `Aporte necessário: ${formatBrl(goal.requiredMonthly)}`,
              `Sobra do mês: ${formatBrl(fs.cashFlow.surplus)}`,
              `Meses restantes: ${goal.deadlineMonths}`,
            ],
          },
        ],
        source: "goals",
      });
    }
  }

  if (
    fs.investments.concentrationPct != null &&
    fs.investments.concentrationPct >= AI_THRESHOLDS.concentrationPct &&
    fs.investments.concentrationClass
  ) {
    out.push({
      id: "portfolio-concentration",
      title: "Concentração na carteira",
      summary: `${fs.investments.concentrationClass} concentra ${fs.investments.concentrationPct.toFixed(0)}% dos investimentos. Vale revisar se isso está alinhado aos seus objetivos.`,
      severity: "info",
      evidence: [
        {
          metric: "allocation",
          label: fs.investments.concentrationClass,
          current: fs.investments.concentrationPct,
          details: fs.investments.allocation
            .slice(0, 5)
            .map((a) => `${a.class}: ${(a.percentage * 100).toFixed(0)}%`),
        },
      ],
      source: "investments",
    });
  }

  return out.slice(0, 10);
}
