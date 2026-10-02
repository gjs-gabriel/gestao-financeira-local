import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyImportDraft,
  buildImportDraft,
  cashflowLastMonths,
  annualCashflow,
  createEmptySnapshot,
  createSeedInstitutions,
  matchInstitutionByName,
  monthlyCashflow,
  monthlyCashflowDetailed,
  netWorth,
  normalizeToMonthly,
  goalProgress,
  parseSnapshot,
  percentChange,
  shiftMonth,
  incomeCommitment,
  commitmentSplit,
  installmentLoadByMonth,
  projectedCashflow,
} from "./index";

describe("normalizeToMonthly", () => {
  it("converte frequências", () => {
    assert.equal(normalizeToMonthly(100, "monthly"), 100);
    assert.equal(normalizeToMonthly(1200, "yearly"), 100);
    assert.ok(Math.abs(normalizeToMonthly(10, "weekly") - (10 * 52) / 12) < 1e-9);
  });
});

describe("netWorth e cashflow", () => {
  it("calcula patrimônio e sobra", () => {
    const s = createEmptySnapshot();
    s.investments.push({
      id: "1",
      name: "CDB",
      amount: 10000,
      classification: "renda_fixa",
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    s.debts.push({
      id: "2",
      name: "Cartão",
      balance: 2500,
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    s.incomes.push({
      id: "3",
      type: "salary",
      name: "Salário",
      amount: 5000,
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    s.recurringExpenses.push({
      id: "4",
      name: "Aluguel",
      amount: 1500,
      frequency: "monthly",
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    assert.equal(netWorth(s.investments, s.debts), 7500);
    const cash = monthlyCashflow(s, 2026, 9);
    assert.equal(cash.surplus, 3500);
  });

  it("inclui renda pontual no mês e série anual", () => {
    const s = createEmptySnapshot();
    s.incomes.push({
      id: "i1",
      type: "salary",
      name: "Salário",
      amount: 3000,
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    s.oneTimeIncomes.push({
      id: "oti1",
      name: "Freelance",
      amount: 500,
      date: "2026-09-10",
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    s.oneTimeExpenses.push({
      id: "otx1",
      name: "Farmácia",
      amount: 80,
      date: "2026-09-12",
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    const d = monthlyCashflowDetailed(s, 2026, 9);
    assert.equal(d.recurringIncome, 3000);
    assert.equal(d.oneTimeIncome, 500);
    assert.equal(d.income, 3500);
    assert.equal(d.oneTimeExpenses, 80);
    assert.equal(d.surplus, 3420);

    const series = cashflowLastMonths(s, 2026, 9, 3);
    assert.equal(series.length, 3);
    assert.equal(series[2]!.key, "2026-09");

    const annual = annualCashflow(s, 2026);
    assert.equal(annual.months.length, 12);
    assert.equal(annual.totals.oneTimeIncome, 500);
  });

  it("soma a parcela só nos meses do plano", () => {
    const s = createEmptySnapshot();
    s.installmentExpenses.push({
      id: "px1",
      name: "Notebook",
      installmentAmount: 200,
      totalInstallments: 3,
      startDate: "2026-09-05",
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
    });
    assert.equal(monthlyCashflow(s, 2026, 8).installmentExpenses, 0);
    assert.equal(monthlyCashflow(s, 2026, 9).installmentExpenses, 200);
    assert.equal(monthlyCashflow(s, 2026, 11).installmentExpenses, 200);
    assert.equal(monthlyCashflow(s, 2026, 12).installmentExpenses, 0);
    assert.equal(annualCashflow(s, 2026).totals.installmentExpenses, 600);
    const loads = installmentLoadByMonth(s, 2026, 9, 4);
    assert.equal(loads[0]!.amount, 200);
    assert.equal(loads[3]!.amount, 0);
    const projected = projectedCashflow(s, 2026, 9, 2, new Date("2026-09-15"));
    assert.equal(projected[0]!.projected, false);
    assert.equal(projected[1]!.projected, true);
  });
});

describe("insights", () => {
  it("mede variação e mês anterior", () => {
    assert.equal(percentChange(110, 100), 10);
    assert.equal(percentChange(50, 0), null);
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
    const cash = monthlyCashflow(createEmptySnapshot(), 2026, 9);
    const commitment = incomeCommitment({ ...cash, income: 1000, totalExpenses: 400, surplus: 600, recurringExpenses: 400, oneTimeExpenses: 0, installmentExpenses: 0 });
    assert.equal(commitment.available, 600);
    assert.equal(commitment.ratio, 0.4);
    assert.deepEqual(commitmentSplit(1000, 500), {
      comprometido: 500,
      disponivel: 500,
      acima: 0,
    });
  });
});

describe("import draft", () => {
  it("aplica gastos/créditos e pula duplicatas", () => {
    const s = createEmptySnapshot();
    const draft = buildImportDraft(s, [
      {
        rowIndex: 0,
        date: "2026-09-01",
        description: "Padaria",
        amount: -25.5,
      },
      {
        rowIndex: 1,
        date: "2026-09-02",
        description: "PIX recebido",
        amount: 200,
      },
    ]);
    assert.equal(draft[0]!.kind, "expense");
    assert.equal(draft[1]!.kind, "income");

    const first = applyImportDraft(s, draft);
    assert.equal(first.addedExpenses, 1);
    assert.equal(first.addedIncomes, 1);

    const again = applyImportDraft(first.snapshot, draft);
    assert.equal(again.addedExpenses, 0);
    assert.equal(again.addedIncomes, 0);
    assert.equal(again.skippedDuplicates, 2);
  });
});

describe("institutions", () => {
  it("contém seeds obrigatórios e casa aliases", () => {
    const seeds = createSeedInstitutions();
    const names = seeds.map((i) => i.name);
    for (const required of [
      "Banco Inter",
      "Mercado Pago",
      "Nubank",
      "PicPay",
      "Banco do Brasil",
      "Caixa Econômica Federal",
      "Swile",
    ]) {
      assert.ok(names.includes(required), `faltou ${required}`);
    }
    assert.ok(seeds.length >= 25);
    const m = matchInstitutionByName("swille", seeds);
    assert.equal(m.institutionId, "inst-swile");
    const n = matchInstitutionByName("NuBank", seeds);
    assert.equal(n.institutionId, "inst-nubank");
  });

  it("migra schema 1 sem institutions", () => {
    const raw = {
      schemaVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      incomes: [],
      investments: [
        {
          id: "1",
          name: "CDB",
          amount: 100,
          classification: "renda_fixa",
          institution: "Nubank",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      recurringExpenses: [],
      oneTimeExpenses: [],
      debts: [],
      goals: [],
      categories: [],
    };
    const s = parseSnapshot(raw);
    assert.equal(s.schemaVersion, 5);
    assert.deepEqual(s.installmentExpenses, []);
    assert.ok(s.accounts.length >= 1);
    assert.equal(s.accounts[0]!.id, "acc_principal");
    assert.ok(s.institutions.length > 10);
    assert.equal(s.investments[0]!.institutionId, "inst-nubank");
  });
});

describe("goalProgress", () => {
  it("limita entre 0 e 1", () => {
    assert.equal(
      goalProgress({
        id: "g",
        name: "x",
        targetAmount: 1000,
        currentAmount: 250,
        createdAt: "",
        updatedAt: "",
      }),
      0.25,
    );
    assert.equal(
      goalProgress({
        id: "g",
        name: "x",
        targetAmount: 1000,
        currentAmount: 2000,
        createdAt: "",
        updatedAt: "",
      }),
      1,
    );
  });
});
