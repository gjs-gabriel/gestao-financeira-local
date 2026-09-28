import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMarinaDemoSnapshot } from "@/domain/marina-demo";
import {
  assertAIContextIsSafe,
  buildFinancialAIContext,
  buildFinancialAlerts,
  buildFinancialInsights,
  buildFinancialPatterns,
  buildFinancialSnapshot,
  sanitizeFinancialData,
  selectContextFacts,
  analyzeBudgetOpportunities,
  analyzePortfolioForAI,
  runCommonScenarios,
  scenarioGoalRequired,
  scenarioMonthlyContribution,
} from "@/ai/finance";
import { classifyQuestionIntent } from "@/ai/core/ContextSelector";

describe("FinancialSnapshotBuilder", () => {
  it("constrói agregados a partir do demo Marina", () => {
    const snap = createMarinaDemoSnapshot();
    const fs = buildFinancialSnapshot(snap, 2026, 9, 12);
    assert.equal(fs.period.currentMonth, "2026-09");
    assert.ok(fs.income.current > 0);
    assert.ok(fs.expenses.current > 0);
    assert.ok(fs.netWorth.current !== 0);
    assert.ok(fs.investments.total > 0);
    assert.ok(fs.goals.length >= 1);
    assert.ok(Array.isArray(fs.history.months));
  });
});

describe("FinancialPrivacySanitizer", () => {
  it("remove campos sensíveis", () => {
    const dirty = {
      pin: "3247",
      vaultId: "vault-abc",
      encryptionKey: "secret",
      income: { current: 1000 },
      institutionName: "Nubank",
      description: "Compra iFood Marina",
    };
    const clean = sanitizeFinancialData(dirty) as Record<string, unknown>;
    assert.equal(clean.pin, undefined);
    assert.equal(clean.vaultId, undefined);
    assert.equal(clean.encryptionKey, undefined);
    assert.equal(clean.institutionName, undefined);
    assert.equal(clean.description, undefined);
    assert.deepEqual(clean.income, { current: 1000 });
  });

  it("AI context must never contain PIN, keys, vault ids", () => {
    const snap = createMarinaDemoSnapshot();
    const fs = buildFinancialSnapshot(snap, 2026, 9);
    const ctx = buildFinancialAIContext(fs, "overview");
    const check = assertAIContextIsSafe(ctx);
    assert.equal(check.ok, true, check.violations.join(", "));
    const json = JSON.stringify(ctx);
    assert.equal(/\"pin\"\s*:/i.test(json), false);
    assert.equal(/vaultId|encryptionKey|indexedDB/i.test(json), false);
  });

  it("ContextSelector limita fatos por intenção", () => {
    const snap = createMarinaDemoSnapshot();
    const fs = buildFinancialSnapshot(snap, 2026, 9);
    const inv = selectContextFacts(fs, "investments");
    assert.ok("investments" in inv);
    assert.equal("expenses" in inv, false);
  });
});

describe("engines determinísticos", () => {
  it("gera insights com evidência", () => {
    const fs = buildFinancialSnapshot(createMarinaDemoSnapshot(), 2026, 9);
    const insights = buildFinancialInsights(fs);
    assert.ok(insights.length >= 1);
    for (const i of insights) {
      assert.ok(i.evidence.length >= 1);
      assert.ok(i.summary.length > 0);
    }
  });

  it("gera alertas e padrões", () => {
    const fs = buildFinancialSnapshot(createMarinaDemoSnapshot(), 2026, 9);
    const alerts = buildFinancialAlerts(fs);
    const patterns = buildFinancialPatterns(fs);
    assert.ok(Array.isArray(alerts));
    assert.ok(patterns.length >= 1);
  });

  it("orçamento e carteira descritivos", () => {
    const fs = buildFinancialSnapshot(createMarinaDemoSnapshot(), 2026, 9);
    const budget = analyzeBudgetOpportunities(fs, "increase_contribution");
    assert.ok(budget.summary.length > 0);
    const portfolio = analyzePortfolioForAI(fs);
    assert.ok(portfolio.summary.length > 0);
    assert.equal(/compre|venda/i.test(portfolio.summary), false);
  });

  it("cenários com premissas", () => {
    const goal = scenarioGoalRequired({
      goalName: "Teste",
      remaining: 12000,
      months: 12,
    });
    assert.equal(goal.raw.monthly, 1000);
    assert.ok(goal.premises.length >= 2);
    assert.ok(goal.disclaimer.includes("Simulação"));

    const contrib = scenarioMonthlyContribution({
      monthlyAmount: 2000,
      months: 36,
    });
    assert.equal(contrib.raw.total, 72000);

    const fs = buildFinancialSnapshot(createMarinaDemoSnapshot(), 2026, 9);
    const common = runCommonScenarios(fs);
    assert.ok(common.length >= 2);
  });
});

describe("ContextSelector intent", () => {
  it("classifica perguntas", () => {
    assert.equal(
      classifyQuestionIntent("Como está minha carteira?"),
      "investments",
    );
    assert.equal(
      classifyQuestionIntent("Se eu guardar R$ 2.000 por mês?"),
      "scenario",
    );
    assert.equal(
      classifyQuestionIntent("Quais são meus maiores gastos?"),
      "expenses",
    );
  });
});

describe("AI must never modify financial data", () => {
  it("snapshot builder não muta vault", () => {
    const snap = createMarinaDemoSnapshot();
    const before = JSON.stringify(snap.goals);
    buildFinancialSnapshot(snap, 2026, 9);
    buildFinancialInsights(buildFinancialSnapshot(snap, 2026, 9));
    assert.equal(JSON.stringify(snap.goals), before);
  });
});
