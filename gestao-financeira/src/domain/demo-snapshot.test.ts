import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoSnapshot,
  createEmptySnapshot,
  isDemoSnapshot,
  isMarinaDemoSnapshot,
} from "./index";

describe("demo snapshot", () => {
  it("createDemoSnapshot aponta para a persona Marina", () => {
    const demo = createDemoSnapshot(new Date("2026-09-15T12:00:00.000Z"));
    assert.equal(isDemoSnapshot(demo), true);
    assert.equal(isMarinaDemoSnapshot(demo), true);
    assert.ok(demo.incomes.length >= 2);
    assert.ok(demo.investments.length >= 4);
    assert.ok(demo.recurringExpenses.length >= 4);
    assert.ok(demo.oneTimeExpenses.length >= 5);
    assert.ok(demo.debts.length >= 1);
    assert.ok(demo.goals.length >= 3);
    assert.ok((demo.creditCards ?? []).length >= 1);
    assert.ok((demo.accounts ?? []).length >= 3);
    assert.ok((demo.budgets ?? []).length >= 1);
    assert.ok((demo.wealthHistory ?? []).length >= 1);
  });

  it("é independente de um snapshot vazio", () => {
    const empty = createEmptySnapshot("2026-09-15T12:00:00.000Z");
    const demo = createDemoSnapshot(new Date("2026-09-15T12:00:00.000Z"));
    assert.equal(isDemoSnapshot(empty), false);
    assert.notEqual(demo.incomes.length, empty.incomes.length);
  });
});
