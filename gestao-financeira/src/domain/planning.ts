import { goalProgress } from "./calculations";
import type { Debt, Goal } from "./types";

/** Meses restantes até o prazo (mínimo 1 se ainda não passou). */
export function monthsUntilDeadline(
  deadline: string | undefined,
  today = new Date(),
): number | null {
  if (!deadline) return null;
  const end = new Date(`${deadline.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const months =
    (end.getFullYear() - today.getFullYear()) * 12 +
    (end.getMonth() - today.getMonth());
  if (months < 0) return 0;
  return Math.max(1, months || 1);
}

export interface SmartGoalInsight {
  progress: number;
  remaining: number;
  monthsLeft: number | null;
  /** Aporte mensal necessário para bater a meta no prazo. */
  requiredMonthly: number | null;
  /** Meses estimados no ritmo atual (se currentAmount > 0 e houver histórico implícito = current/monthsElapsed — usamos ritmo informado). */
  monthsAtPace: number | null;
  onTrack: boolean | null;
}

export function smartGoalInsight(
  goal: Goal,
  opts?: { monthlyPace?: number; today?: Date },
): SmartGoalInsight {
  const progress = goalProgress(goal);
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const monthsLeft = monthsUntilDeadline(goal.deadline, opts?.today);
  const requiredMonthly =
    monthsLeft !== null && monthsLeft > 0
      ? Math.round((remaining / monthsLeft) * 100) / 100
      : monthsLeft === 0
        ? remaining
        : null;

  const pace = opts?.monthlyPace;
  const monthsAtPace =
    pace && pace > 0 ? Math.ceil(remaining / pace) : null;
  const onTrack =
    requiredMonthly === null || pace === undefined
      ? null
      : pace + 1e-9 >= requiredMonthly;

  return {
    progress,
    remaining,
    monthsLeft,
    requiredMonthly,
    monthsAtPace,
    onTrack,
  };
}

export interface DebtPlanInput {
  balance: number;
  /** Taxa anual % */
  interestRate?: number;
  /** Parcela mensal */
  installmentAmount?: number;
  /** Pagamento extra mensal */
  extraMonthly?: number;
}

export interface DebtPlanResult {
  months: number;
  totalPaid: number;
  totalInterest: number;
  schedule: { month: number; payment: number; interest: number; balance: number }[];
}

/**
 * Simula amortização price-like simples: juros mensais sobre saldo + pagamento fixo.
 * Se não houver parcela, estima 1% do saldo ou mínimo R$ 50.
 */
export function simulateDebtPayoff(input: DebtPlanInput): DebtPlanResult {
  let balance = Math.max(0, input.balance);
  const annual = input.interestRate ?? 0;
  const monthlyRate = annual / 100 / 12;
  let payment =
    input.installmentAmount && input.installmentAmount > 0
      ? input.installmentAmount
      : Math.max(50, balance * 0.02);
  payment += Math.max(0, input.extraMonthly ?? 0);

  const schedule: DebtPlanResult["schedule"] = [];
  let totalPaid = 0;
  let totalInterest = 0;
  let month = 0;
  const maxMonths = 600;

  while (balance > 0.01 && month < maxMonths) {
    month += 1;
    const interest = balance * monthlyRate;
    totalInterest += interest;
    balance += interest;
    const pay = Math.min(payment, balance);
    balance -= pay;
    totalPaid += pay;
    schedule.push({
      month,
      payment: Math.round(pay * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      balance: Math.round(Math.max(0, balance) * 100) / 100,
    });
    if (pay <= interest && monthlyRate > 0 && month > 12) {
      // parcela não cobre juros — evita loop infinito
      break;
    }
  }

  return {
    months: month,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    schedule,
  };
}

export function compareDebtPlans(debt: Debt, extraMonthly: number) {
  const base = simulateDebtPayoff({
    balance: debt.balance,
    interestRate: debt.interestRate,
    installmentAmount: debt.installmentAmount,
  });
  const withExtra = simulateDebtPayoff({
    balance: debt.balance,
    interestRate: debt.interestRate,
    installmentAmount: debt.installmentAmount,
    extraMonthly,
  });
  return {
    base,
    withExtra,
    monthsSaved: Math.max(0, base.months - withExtra.months),
    interestSaved: Math.max(0, base.totalInterest - withExtra.totalInterest),
  };
}
