import type { CashflowMonthPoint } from "./cashflow";
import { monthLabel } from "./cashflow";
import { categoryTrend, installmentLoadByMonth, type ProjectedMonth } from "./insights";
import type { DatedInvestmentPosition } from "./import-entities";
import type { VaultSnapshot } from "./types";
import type { WealthSnapshot } from "./v15-types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ExpenseCompositionPoint {
  key: string;
  label: string;
  recorrente: number;
  pontual: number;
  parcelas: number;
}

/** Pilha mensal: recorrente, pontual (já inclui cartão) e parcelas. */
export function expenseCompositionSeries(
  points: CashflowMonthPoint[],
): ExpenseCompositionPoint[] {
  return points.map((point) => ({
    key: point.key,
    label: point.label,
    recorrente: round2(point.recurringExpenses),
    pontual: round2(point.oneTimeExpenses),
    parcelas: round2(point.installmentExpenses),
  }));
}

export interface SavingsRatePoint {
  key: string;
  label: string;
  /** Percentual da entrada que sobrou. Null quando não houve entrada. */
  taxa: number | null;
}

export function savingsRateSeries(
  points: { key: string; label: string; income: number; surplus: number }[],
): SavingsRatePoint[] {
  return points.map((point) => ({
    key: point.key,
    label: point.label,
    taxa:
      point.income > 0
        ? Math.round((point.surplus / point.income) * 1000) / 10
        : null,
  }));
}

export interface CategoryTrendChart {
  series: { categoryId: string; categoryName: string }[];
  points: { key: string; label: string; values: Record<string, number> }[];
}

/** Até `topN` categorias de maior soma, uma coluna por categoria em cada mês. */
export function categoryTrendChart(
  snapshot: VaultSnapshot,
  endYear: number,
  endMonth: number,
  count = 12,
  topN = 5,
): CategoryTrendChart {
  const ranked = categoryTrend(snapshot, endYear, endMonth, count).slice(0, topN);
  const months = ranked[0]?.points ?? [];
  return {
    series: ranked.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
    })),
    points: months.map((slot, index) => ({
      key: slot.key,
      label: slot.label,
      values: Object.fromEntries(
        ranked.map((row) => [row.categoryId, round2(row.points[index]?.amount ?? 0)]),
      ),
    })),
  };
}

export interface ProjectedBalancePoint {
  key: string;
  label: string;
  realizado: number | null;
  previsto: number | null;
}

/**
 * Saldo realizado até o mês corrente e previsto a partir dele.
 * O mês da virada entra nas duas séries para a linha não quebrar.
 */
export function projectedBalanceSeries(
  points: ProjectedMonth[],
): ProjectedBalancePoint[] {
  const firstFuture = points.findIndex((point) => point.projected);
  const hinge = firstFuture === -1 ? -1 : Math.max(0, firstFuture - 1);
  return points.map((point, index) => ({
    key: point.key,
    label: point.label,
    realizado:
      hinge === -1 || index <= hinge ? round2(point.surplus) : null,
    previsto: hinge !== -1 && index >= hinge ? round2(point.surplus) : null,
  }));
}

export interface InstallmentLoadPoint {
  key: string;
  label: string;
  parcelas: number;
}

export function futureInstallmentSeries(
  snapshot: VaultSnapshot,
  startYear: number,
  startMonth: number,
  count = 12,
): InstallmentLoadPoint[] {
  return installmentLoadByMonth(snapshot, startYear, startMonth, count).map(
    (point) => ({
      key: point.key,
      label: point.label,
      parcelas: round2(point.amount),
    }),
  );
}

export interface WealthChartPoint {
  key: string;
  label: string;
  ativos: number;
  passivos: number;
  pl: number;
}

export function wealthChartSeries(history: WealthSnapshot[]): WealthChartPoint[] {
  return history.map((point) => {
    const [yearText, monthText] = point.periodKey.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    return {
      key: point.periodKey,
      label:
        Number.isFinite(year) && Number.isFinite(month)
          ? monthLabel(year, month)
          : point.periodKey,
      ativos: round2(point.assets),
      passivos: round2(point.liabilities),
      pl: round2(point.netWorth),
    };
  });
}

export interface PositionHistoryChart {
  series: { investmentId: string; name: string }[];
  points: { date: string; values: Record<string, number> }[];
}

/** Até `limit` investimentos com pelo menos dois pontos, pelos de maior valor recente. */
export function positionHistoryChart(
  history: DatedInvestmentPosition[],
  investmentNames: ReadonlyMap<string, string>,
  limit = 5,
): PositionHistoryChart {
  const groups = new Map<string, DatedInvestmentPosition[]>();
  for (const point of history) {
    const rows = groups.get(point.investmentId) ?? [];
    rows.push(point);
    groups.set(point.investmentId, rows);
  }

  const ranked = [...groups.entries()]
    .filter(([, rows]) => rows.length >= 2)
    .map(([investmentId, rows]) => {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1];
      return { investmentId, sorted, latestValue: latest?.value ?? 0 };
    })
    .sort((a, b) => b.latestValue - a.latestValue)
    .slice(0, limit);

  const dates = [...new Set(ranked.flatMap((row) => row.sorted.map((point) => point.date)))].sort();

  return {
    series: ranked.map((row) => ({
      investmentId: row.investmentId,
      name: investmentNames.get(row.investmentId) ?? "Aplicação",
    })),
    points: dates.map((date) => ({
      date,
      values: Object.fromEntries(
        ranked.flatMap((row) => {
          const match = row.sorted.find((point) => point.date === date);
          return match ? [[row.investmentId, round2(match.value)] as const] : [];
        }),
      ),
    })),
  };
}

export interface DebtAmortizationPoint {
  month: number;
  semExtra: number | null;
  comExtra: number | null;
}

/** Alinha os dois planos pelo mês. Acima de `maxPoints`, amostra incluindo o primeiro e o último. */
export function debtAmortizationSeries(
  base: { month: number; balance: number }[],
  extra: { month: number; balance: number }[],
  maxPoints = 120,
): DebtAmortizationPoint[] {
  const length = Math.max(base.length, extra.length);
  const rows: DebtAmortizationPoint[] = Array.from({ length }, (_, index) => ({
    month: base[index]?.month ?? extra[index]?.month ?? index + 1,
    semExtra: base[index] ? round2(base[index].balance) : null,
    comExtra: extra[index] ? round2(extra[index].balance) : null,
  }));
  return sampleRows(rows, maxPoints);
}

function sampleRows<T>(rows: T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints || maxPoints < 2) return rows;
  const last = rows.length - 1;
  const indexes = new Set<number>();
  for (let i = 0; i < maxPoints; i++) {
    indexes.add(Math.round((i * last) / (maxPoints - 1)));
  }
  return [...indexes].sort((a, b) => a - b).map((index) => rows[index]!);
}
