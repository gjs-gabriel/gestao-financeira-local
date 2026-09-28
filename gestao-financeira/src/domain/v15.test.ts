import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildImportDraft,
  budgetProgressForMonth,
  computeAlerts,
  createEmptySnapshot,
  createTransfer,
  matchCategorizationRule,
  payInvoice,
  recordCardPurchase,
  upsertEntity,
} from "./index";
import type { CreditCard } from "./ledger-types";

const now = "2026-09-15T12:00:00.000Z";

describe("v1.5 cards transfer budgets rules", () => {
  it("compra no cartão e pagamento não duplicam despesa no PL", () => {
    let s = createEmptySnapshot(now);
    const card: CreditCard = {
      id: "card1",
      name: "Nubank",
      limit: 5000,
      closingDay: 25,
      dueDay: 5,
      paymentAccountId: "acc_principal",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    s = upsertEntity(s, "creditCards", card);
    s = upsertEntity(s, "accounts", {
      ...s.accounts[0]!,
      openingBalance: 3000,
    });
    s = recordCardPurchase(s, {
      cardId: "card1",
      amount: 200,
      date: "2026-09-10",
      description: "Mercado",
      categoryId: "cat-alimentacao",
    });
    assert.equal(s.transactions.filter((t) => t.kind === "card_purchase").length, 1);
    assert.ok(s.invoices.length >= 1);
    const inv = s.invoices[0]!;
    s = payInvoice(s, inv.id);
    assert.equal(s.invoices[0]!.status, "paid");
    assert.equal(
      s.transactions.filter((t) => t.kind === "invoice_payment").length,
      1,
    );
  });

  it("transferência usa createTransfer", () => {
    const s = createEmptySnapshot(now);
    const b = {
      ...s.accounts[0]!,
      id: "acc_b",
      name: "XP",
    };
    let next = upsertEntity(s, "accounts", b);
    const tx = createTransfer({
      id: "tx_t",
      fromAccountId: "acc_principal",
      toAccountId: "acc_b",
      amount: 100,
      date: "2026-09-01",
      description: "Aporte",
      now,
    });
    next = upsertEntity(next, "transactions", tx);
    assert.equal(next.transactions[0]!.kind, "transfer");
  });

  it("orçamento detecta estouro e regra categoriza import", () => {
    let s = createEmptySnapshot(now);
    s = upsertEntity(s, "budgets", {
      id: "bud1",
      name: "Alimentação",
      categoryId: "cat-alimentacao",
      limitAmount: 100,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    s = upsertEntity(s, "oneTimeExpenses", {
      id: "otx1",
      name: "Mercado",
      amount: 150,
      date: "2026-09-05",
      categoryId: "cat-alimentacao",
      createdAt: now,
      updatedAt: now,
    });
    const progress = budgetProgressForMonth(s, 2026, 9);
    assert.equal(progress[0]!.status, "over");

    s = upsertEntity(s, "categorizationRules", {
      id: "r1",
      name: "Uber",
      matchField: "description",
      contains: "UBER",
      categoryId: "cat-transporte",
      priority: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const rule = matchCategorizationRule(s.categorizationRules, {
      description: "UBER TRIP 123",
    });
    assert.equal(rule?.categoryId, "cat-transporte");
    const draft = buildImportDraft(s, [
      {
        rowIndex: 0,
        date: "2026-09-02",
        description: "UBER TRIP",
        amount: -30,
      },
    ]);
    assert.equal(draft[0]!.categoryId, "cat-transporte");

    const alerts = computeAlerts(s, new Date("2026-09-15"));
    assert.ok(alerts.some((a) => a.kind === "budget_over"));
  });
});
