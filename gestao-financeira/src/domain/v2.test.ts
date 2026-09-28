import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareDebtPlans,
  contributeToInvestment,
  createEmptySnapshot,
  redeemFromInvestment,
  smartGoalInsight,
  upsertEntity,
  upsertInvestmentSynced,
  wealthBreakdown,
} from "./index";

const now = "2026-09-15T12:00:00.000Z";

describe("v2 planning wealth investments", () => {
  it("meta inteligente calcula aporte mensal", () => {
    const insight = smartGoalInsight(
      {
        id: "g1",
        name: "Reserva",
        targetAmount: 30000,
        currentAmount: 12000,
        deadline: "2027-12-31",
        createdAt: now,
        updatedAt: now,
      },
      { today: new Date("2026-09-15") },
    );
    assert.ok(insight.monthsLeft !== null && insight.monthsLeft > 0);
    assert.ok(insight.requiredMonthly !== null && insight.requiredMonthly > 0);
    assert.equal(insight.remaining, 18000);
  });

  it("simulação de dívida com extra reduz prazo", () => {
    const cmp = compareDebtPlans(
      {
        id: "d1",
        name: "Empréstimo",
        balance: 10000,
        interestRate: 24,
        installmentAmount: 500,
        createdAt: now,
        updatedAt: now,
      },
      200,
    );
    assert.ok(cmp.withExtra.months < cmp.base.months);
    assert.ok(cmp.interestSaved > 0);
  });

  it("aporte aumenta aplicação e reduz conta sem ser despesa", () => {
    let s = createEmptySnapshot(now);
    s = upsertEntity(s, "accounts", {
      ...s.accounts[0]!,
      openingBalance: 5000,
    });
    s = upsertInvestmentSynced(s, {
      id: "inv1",
      name: "CDB",
      amount: 1000,
      classification: "renda_fixa",
      createdAt: now,
      updatedAt: now,
    });
    s = contributeToInvestment(s, {
      investmentId: "inv1",
      amount: 500,
      date: "2026-09-10",
      accountId: "acc_principal",
    });
    assert.equal(s.investments[0]!.amount, 1500);
    assert.equal(s.transactions.some((t) => t.kind === "investment_buy"), true);
    const w = wealthBreakdown(s);
    // 5000-500 conta + 1500 inv = 6000 assets
    assert.equal(w.accounts, 4500);
    assert.equal(w.investments, 1500);
  });

  it("resgate com rendimento registra income só no lucro", () => {
    let s = createEmptySnapshot(now);
    s = upsertInvestmentSynced(s, {
      id: "inv1",
      name: "CDB",
      amount: 2000,
      classification: "renda_fixa",
      createdAt: now,
      updatedAt: now,
    });
    s = redeemFromInvestment(s, {
      investmentId: "inv1",
      amount: 1100,
      date: "2026-09-10",
      accountId: "acc_principal",
      yieldAmount: 100,
    });
    assert.equal(s.investments[0]!.amount, 900);
    assert.ok(s.transactions.some((t) => t.kind === "investment_sell"));
    assert.ok(
      s.transactions.some((t) => t.kind === "income" && t.amount === 100),
    );
  });
});
