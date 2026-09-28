import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyImportDraft,
  buildImportDraft,
  createEmptySnapshot,
  removeIncomeSynced,
  upsertIncomeSynced,
  upsertOneTimeExpenseSynced,
} from "./index";

describe("sync dual-write", () => {
  it("renda grava incomes e recurringRules", () => {
    let s = createEmptySnapshot();
    const now = s.updatedAt;
    s = upsertIncomeSynced(s, {
      id: "inc_1",
      type: "salary",
      name: "Salário",
      amount: 5000,
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(s.incomes.length, 1);
    assert.equal(s.recurringRules.length, 1);
    assert.equal(s.recurringRules[0]!.kind, "income");
    assert.equal(s.recurringRules[0]!.id, "rule_inc_1");
    s = removeIncomeSynced(s, "inc_1");
    assert.equal(s.incomes.length, 0);
    assert.equal(s.recurringRules.length, 0);
  });

  it("gasto pontual grava oneTimeExpenses e transactions", () => {
    let s = createEmptySnapshot();
    const now = s.updatedAt;
    s = upsertOneTimeExpenseSynced(s, {
      id: "otx_1",
      name: "Farmácia",
      amount: 50,
      date: "2026-09-10",
      createdAt: now,
      updatedAt: now,
    });
    assert.equal(s.oneTimeExpenses.length, 1);
    assert.equal(s.transactions.length, 1);
    assert.equal(s.transactions[0]!.kind, "expense");
    assert.equal(s.transactions[0]!.accountId, "acc_principal");
  });

  it("importação cria Transaction com source import", () => {
    const s = createEmptySnapshot();
    const draft = buildImportDraft(s, [
      {
        rowIndex: 0,
        date: "2026-09-01",
        description: "Padaria",
        amount: -12,
      },
    ]);
    const result = applyImportDraft(s, draft);
    assert.equal(result.addedExpenses, 1);
    assert.equal(result.snapshot.oneTimeExpenses.length, 1);
    assert.equal(result.snapshot.transactions.length, 1);
    assert.equal(result.snapshot.transactions[0]!.source, "import");
  });
});
