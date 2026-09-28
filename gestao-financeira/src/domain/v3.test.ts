import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzePortfolio,
  createEmptySnapshot,
  detectAnomalies,
  detectRecurringCandidates,
  forecastDetailed,
  suggestCategoryFromHistory,
  upsertEntity,
  upsertInvestmentSynced,
  upsertOneTimeExpenseSynced,
} from "./index";

const now = "2026-09-15T12:00:00.000Z";

describe("v3 intelligence", () => {
  it("detecta candidato de recorrência em 3+ meses", () => {
    let s = createEmptySnapshot(now);
    for (const [id, date] of [
      ["a", "2026-07-10"],
      ["b", "2026-08-12"],
      ["c", "2026-09-09"],
    ] as const) {
      s = upsertOneTimeExpenseSynced(s, {
        id,
        name: "Netflix Streaming",
        amount: 55.9,
        date,
        categoryId: s.categories[0]?.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    const candidates = detectRecurringCandidates(s);
    assert.ok(candidates.some((c) => c.name.includes("Netflix")));
    assert.equal(
      candidates.find((c) => c.name.includes("Netflix"))?.suggestedFrequency,
      "monthly",
    );
  });

  it("sugere categoria pelo histórico", () => {
    let s = createEmptySnapshot(now);
    const catId = s.categories.find((c) => c.kind === "expense")?.id;
    assert.ok(catId);
    s = upsertOneTimeExpenseSynced(s, {
      id: "e1",
      name: "Padaria Bom Pao",
      amount: 40,
      date: "2026-08-01",
      categoryId: catId,
      createdAt: now,
      updatedAt: now,
    });
    s = upsertOneTimeExpenseSynced(s, {
      id: "e2",
      name: "Padaria Bom Pao",
      amount: 35,
      date: "2026-09-01",
      categoryId: catId,
      createdAt: now,
      updatedAt: now,
    });
    const sug = suggestCategoryFromHistory(s, "Padaria Bom Pao Centro");
    assert.ok(sug);
    assert.equal(sug!.categoryId, catId);
  });

  it("detecta categoria acima da média", () => {
    let s = createEmptySnapshot(now);
    const cat = s.categories.find((c) => c.kind === "expense");
    assert.ok(cat);
    for (let m = 4; m <= 8; m++) {
      s = upsertOneTimeExpenseSynced(s, {
        id: `low-${m}`,
        name: "Mercado",
        amount: 200,
        date: `2026-0${m}-15`,
        categoryId: cat.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    s = upsertOneTimeExpenseSynced(s, {
      id: "spike",
      name: "Mercado",
      amount: 800,
      date: "2026-09-15",
      categoryId: cat.id,
      createdAt: now,
      updatedAt: now,
    });
    const anomalies = detectAnomalies(s, new Date("2026-09-20"));
    assert.ok(
      anomalies.some((a) => a.kind === "category_above_average"),
      "esperava anomalia de categoria",
    );
  });

  it("forecast inclui meses projetados", () => {
    const s = createEmptySnapshot(now);
    const rows = forecastDetailed(s, 4, new Date("2026-09-15"));
    assert.equal(rows.length, 4);
    assert.ok(rows.some((r) => r.projected));
  });

  it("analisa concentração da carteira", () => {
    let s = createEmptySnapshot(now);
    s = upsertInvestmentSynced(s, {
      id: "inv1",
      name: "CDB Banco X",
      amount: 9000,
      classification: "renda_fixa",
      createdAt: now,
      updatedAt: now,
    });
    s = upsertInvestmentSynced(s, {
      id: "inv2",
      name: "ETF",
      amount: 1000,
      classification: "etfs",
      createdAt: now,
      updatedAt: now,
    });
    const p = analyzePortfolio(s);
    assert.equal(p.total, 10000);
    assert.ok(p.concentration);
    assert.ok(p.concentration!.pct >= 40);
  });

  it("não muta snapshot ao montar relatório", () => {
    let s = createEmptySnapshot(now);
    s = upsertEntity(s, "oneTimeExpenses", {
      id: "x",
      name: "Teste",
      amount: 10,
      date: "2026-09-01",
      createdAt: now,
      updatedAt: now,
    });
    const before = JSON.stringify(s);
    detectRecurringCandidates(s);
    detectAnomalies(s, new Date("2026-09-15"));
    forecastDetailed(s, 3, new Date("2026-09-15"));
    analyzePortfolio(s);
    assert.equal(JSON.stringify(s), before);
  });
});
