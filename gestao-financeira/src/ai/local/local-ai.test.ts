import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNoSecretsInContext,
  buildFinancialContextFromSnapshot,
  buildFinancialTestContext,
  MockLocalAIClient,
  isLocalhostUrl,
} from "./index";
import {
  extractJsonStringField,
  formatAnalysisForDisplay,
  formatChatTextForDisplay,
} from "./formatAnalysis";
import type { FinancialSnapshot } from "../finance/types";

function sampleSnapshot(): FinancialSnapshot {
  return {
    period: {
      currentMonth: "2026-09",
      year: 2026,
      month: 9,
      historicalMonths: 6,
    },
    income: { current: 8500, monthlyAverage: 8200, variation: 0.04 },
    expenses: {
      current: 5200,
      monthlyAverage: 5000,
      variation: 0.04,
      byCategory: [
        {
          category: "Alimentação",
          amount: 1200,
          percentage: 23,
          variation: 0.1,
        },
      ],
    },
    cashFlow: {
      surplus: 3300,
      savingsRate: 0.39,
      commitmentRatio: 0.2,
    },
    netWorth: {
      current: 85000,
      assets: 90000,
      liabilities: 5000,
      variation12m: 0.12,
      history: [{ month: "2026-09", value: 85000 }],
    },
    investments: {
      total: 60000,
      allocation: [
        { class: "renda_fixa", amount: 30000, percentage: 50 },
      ],
      concentrationPct: 50,
      concentrationClass: "renda_fixa",
    },
    debts: {
      total: 5000,
      monthlyPayments: 400,
      items: [{ name: "Cartão", balance: 5000, installmentAmount: 400, interestRate: null }],
    },
    goals: [
      {
        name: "Reserva",
        current: 10000,
        target: 20000,
        progress: 0.5,
        remaining: 10000,
        requiredMonthly: 500,
        deadlineMonths: 20,
      },
    ],
    commitments: { next30Days: 400, next90Days: 1200 },
    history: {
      months: [
        { month: "2026-08", income: 8200, expenses: 5000, surplus: 3200 },
        { month: "2026-09", income: 8500, expenses: 5200, surplus: 3300 },
      ],
    },
  };
}

describe("Local AI — FinancialContext", () => {
  it("builds minimized context without vault secrets", () => {
    const ctx = buildFinancialContextFromSnapshot(sampleSnapshot(), "overview");
    assert.equal(ctx.version, 1);
    assert.equal(ctx.summary.income, 8500);
    assert.ok(ctx.expensesByCategory?.length);
    assertNoSecretsInContext(ctx);
    const raw = JSON.stringify(ctx);
    assert.equal(/pin|password|vault|aes/i.test(raw), false);
  });

  it("rejects context containing PIN-like fields", () => {
    const ctx = buildFinancialTestContext();
    assert.throws(() => {
      assertNoSecretsInContext({
        ...ctx,
        extras: { userPin: "1234" },
      });
    });
  });

  it("only allows localhost URLs for client base", () => {
    assert.equal(isLocalhostUrl("http://127.0.0.1:43128"), true);
    assert.equal(isLocalhostUrl("http://localhost:43128"), true);
    assert.equal(isLocalhostUrl("https://api.openai.com"), false);
  });
});

describe("MockLocalAIClient", () => {
  it("analyzes without network", async () => {
    const client = new MockLocalAIClient();
    const analysis = await client.analyze(buildFinancialTestContext());
    assert.equal(analysis.source, "mock");
    assert.ok(analysis.summary.length > 10);
    assert.ok(Array.isArray(analysis.insights));
  });

  it("health is ok", async () => {
    const client = new MockLocalAIClient();
    const h = await client.healthCheck();
    assert.equal(h.status, "ok");
    assert.equal(h.runtime, "ready");
  });
});

describe("Privacy invariants", () => {
  it("PIN never appears in outbound FinancialContext", () => {
    const ctx = buildFinancialContextFromSnapshot(sampleSnapshot(), "chat", {
      question: "Qual meu pin 3247?",
    });
    // pergunta do usuário pode citar a palavra, mas não enviamos campo pin
    assert.equal("pin" in ctx, false);
    assert.equal("password" in (ctx.extras ?? {}), false);
  });
});

describe("formatAnalysisForDisplay", () => {
  it("extrai summary de JSON truncado sem mostrar chaves cruas", () => {
    const raw =
      '{"summary":"O panorama apresenta saldo negativo de 432 reais no mês. Os investimentos estão em renda fixa.","insights":[{"title":"Fluxo","description":"Atenção ao déficit"';
    const text = formatAnalysisForDisplay(raw);
    assert.equal(text.includes('{"summary"'), false);
    assert.match(text, /saldo negativo de 432/);
  });

  it("formata analysis estruturada", () => {
    const text = formatAnalysisForDisplay({
      summary: "Fluxo positivo no mês.",
      insights: [
        {
          title: "Poupança",
          description: "Taxa de poupança saudável.",
        },
      ],
      recommendations: ["Revise categorias com maior variação."],
      source: "mock",
    });
    assert.match(text, /Fluxo positivo/);
    assert.match(text, /Poupança/);
    assert.match(text, /Pontos de atenção/);
  });

  it("extractJsonStringField lê summary truncado", () => {
    const s = extractJsonStringField(
      '{"summary":"Texto parcial sem fechar',
      "summary",
    );
    assert.ok(s && s.includes("Texto parcial"));
  });

  it("formatChatTextForDisplay limpa JSON do chat", () => {
    const t = formatChatTextForDisplay(
      '{"summary":"Resposta em prosa clara."}',
    );
    assert.equal(t, "Resposta em prosa clara.");
  });
});
