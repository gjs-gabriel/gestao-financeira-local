import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CashflowMonthPoint } from "./cashflow";
import {
  categoryTrendChart,
  createEmptySnapshot,
  debtAmortizationSeries,
  expenseCompositionSeries,
  futureInstallmentSeries,
  positionHistoryChart,
  projectedBalanceSeries,
  savingsRateSeries,
  wealthChartSeries,
} from "./index";
import type { ProjectedMonth } from "./insights";

function point(
  partial: Partial<CashflowMonthPoint> & { key: string },
): CashflowMonthPoint {
  return {
    year: 2026,
    month: 1,
    label: partial.key,
    income: 0,
    recurringExpenses: 0,
    oneTimeExpenses: 0,
    installmentExpenses: 0,
    totalExpenses: 0,
    surplus: 0,
    recurringIncome: 0,
    oneTimeIncome: 0,
    ...partial,
  };
}

describe("expenseCompositionSeries", () => {
  it("separa recorrente, pontual e parcelas", () => {
    const rows = expenseCompositionSeries([
      point({
        key: "2026-01",
        recurringExpenses: 100.126,
        oneTimeExpenses: 40,
        installmentExpenses: 10,
      }),
    ]);
    assert.deepEqual(rows[0], {
      key: "2026-01",
      label: "2026-01",
      recorrente: 100.13,
      pontual: 40,
      parcelas: 10,
    });
  });
});

describe("savingsRateSeries", () => {
  it("calcula o percentual e omite mês sem entrada", () => {
    const rows = savingsRateSeries([
      { key: "2026-01", label: "jan", income: 1000, surplus: 250 },
      { key: "2026-02", label: "fev", income: 0, surplus: -10 },
    ]);
    assert.equal(rows[0]?.taxa, 25);
    assert.equal(rows[1]?.taxa, null);
  });
});

describe("projectedBalanceSeries", () => {
  it("repete o mês da virada nas duas linhas", () => {
    const months: ProjectedMonth[] = [
      month("2026-01", 100, false),
      month("2026-02", 80, false),
      month("2026-03", 50, true),
    ];
    const rows = projectedBalanceSeries(months);
    assert.deepEqual(
      rows.map((row) => [row.realizado, row.previsto]),
      [
        [100, null],
        [80, 80],
        [null, 50],
      ],
    );
  });

  it("mantém só realizado quando não há futuro", () => {
    const rows = projectedBalanceSeries([month("2026-01", 10, false)]);
    assert.equal(rows[0]?.realizado, 10);
    assert.equal(rows[0]?.previsto, null);
  });
});

describe("debtAmortizationSeries", () => {
  it("alinha os planos e amostra acima do limite", () => {
    const base = Array.from({ length: 200 }, (_, index) => ({
      month: index + 1,
      balance: 200 - index,
    }));
    const extra = [{ month: 1, balance: 50 }];
    const rows = debtAmortizationSeries(base, extra, 120);
    assert.equal(rows.length, 120);
    assert.equal(rows[0]?.month, 1);
    assert.equal(rows[0]?.comExtra, 50);
    assert.equal(rows[1]?.comExtra, null);
    assert.equal(rows[rows.length - 1]?.month, 200);
    assert.equal(rows[rows.length - 1]?.semExtra, 1);
  });
});

describe("wealthChartSeries e posições", () => {
  it("nomeia o mês e mantém ativos, passivos e patrimônio", () => {
    const rows = wealthChartSeries([
      {
        periodKey: "2026-03",
        date: "2026-03-01",
        assets: 1000,
        liabilities: 200,
        netWorth: 800,
      },
    ]);
    assert.equal(rows[0]?.label, "mar/2026");
    assert.equal(rows[0]?.ativos, 1000);
    assert.equal(rows[0]?.passivos, 200);
    assert.equal(rows[0]?.pl, 800);
  });

  it("ignora posição com um ponto e limita às maiores", () => {
    const chart = positionHistoryChart(
      [
        pos("a", "2026-01-01", 10),
        pos("a", "2026-02-01", 30),
        pos("b", "2026-02-01", 5),
        pos("c", "2026-01-01", 100),
        pos("c", "2026-02-01", 90),
      ],
      new Map([
        ["a", "CDB"],
        ["c", "FII"],
      ]),
      1,
    );
    assert.deepEqual(chart.series, [{ investmentId: "c", name: "FII" }]);
    assert.equal(chart.points[1]?.values.c, 90);
    assert.equal(chart.points[1]?.values.a, undefined);
  });
});

describe("categoryTrendChart e parcelas futuras", () => {
  it("pivota as categorias de maior soma", () => {
    const snapshot = createEmptySnapshot("2026-03-01T12:00:00.000Z");
    snapshot.oneTimeExpenses.push(
      expense("e1", "Mercado", 300, "2026-01-10", "cat-alimentacao"),
      expense("e2", "Mercado", 100, "2026-02-10", "cat-alimentacao"),
      expense("e3", "Uber", 20, "2026-02-10", "cat-transporte"),
    );
    const chart = categoryTrendChart(snapshot, 2026, 2, 2, 1);
    assert.equal(chart.series[0]?.categoryId, "cat-alimentacao");
    assert.equal(chart.series.length, 1);
    assert.equal(chart.points[0]?.values["cat-alimentacao"], 300);
    assert.equal(chart.points[1]?.values["cat-alimentacao"], 100);
  });

  it("projeta a carga de parcelas", () => {
    const snapshot = createEmptySnapshot("2026-01-01T12:00:00.000Z");
    snapshot.installmentExpenses.push({
      id: "parcela",
      name: "Notebook",
      installmentAmount: 200,
      totalInstallments: 3,
      startDate: "2026-01-15",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const rows = futureInstallmentSeries(snapshot, 2026, 1, 4);
    assert.deepEqual(
      rows.map((row) => row.parcelas),
      [200, 200, 200, 0],
    );
  });
});

function month(key: string, surplus: number, projected: boolean): ProjectedMonth {
  const [year, monthNumber] = key.split("-").map(Number);
  return {
    year: year!,
    month: monthNumber!,
    key,
    label: key,
    income: 0,
    expenses: 0,
    surplus,
    projected,
  };
}

function pos(investmentId: string, date: string, value: number) {
  return {
    id: `${investmentId}-${date}`,
    investmentId,
    date,
    value,
    createdAt: date,
    updatedAt: date,
  };
}

function expense(
  id: string,
  name: string,
  amount: number,
  date: string,
  categoryId: string,
) {
  return {
    id,
    name,
    amount,
    date,
    categoryId,
    createdAt: date,
    updatedAt: date,
  };
}
