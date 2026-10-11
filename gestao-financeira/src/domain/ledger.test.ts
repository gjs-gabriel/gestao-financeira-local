import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountBalance,
  cashflowFromTransactions,
  createEmptySnapshot,
  createTransfer,
  netWorthLedger,
  parseSnapshot,
} from "./index";
import type { Account, CreditCardInvoice, Transaction } from "./ledger-types";

const now = "2026-09-27T12:00:00.000Z";

function account(partial?: Partial<Account>): Account {
  return {
    id: "acc_a",
    name: "Nubank",
    type: "checking",
    openingBalance: 1000,
    openingDate: "2026-01-01",
    currency: "BRL",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe("ledger", () => {
  it("transferência move saldo e não altera PL nem fluxo", () => {
    const a = account({ id: "acc_a", openingBalance: 1000 });
    const b = account({ id: "acc_b", name: "XP", openingBalance: 0 });
    const transfer = createTransfer({
      id: "tx_t1",
      fromAccountId: "acc_a",
      toAccountId: "acc_b",
      amount: 400,
      date: "2026-09-10",
      description: "Nubank → XP",
      now,
    });
    const txs = [transfer];
    assert.equal(accountBalance(a, txs), 600);
    assert.equal(accountBalance(b, txs), 400);
    const worthBefore = netWorthLedger({
      accounts: [a, b],
      transactions: [],
      investments: [],
      invoices: [],
      debts: [],
    });
    const worthAfter = netWorthLedger({
      accounts: [a, b],
      transactions: txs,
      investments: [],
      invoices: [],
      debts: [],
    });
    assert.equal(worthBefore, worthAfter);
    const flow = cashflowFromTransactions(txs, 2026, 9);
    assert.equal(flow.income, 0);
    assert.equal(flow.expense, 0);
  });

  it("compra no cartão entra no fluxo e na fatura, não no saldo da conta", () => {
    const bank = account({ openingBalance: 2000 });
    const invoice: CreditCardInvoice = {
      id: "inv1",
      creditCardId: "card1",
      periodKey: "2026-09",
      closingDate: "2026-09-25",
      dueDate: "2026-10-05",
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    const purchase: Transaction = {
      id: "tx_c1",
      kind: "card_purchase",
      date: "2026-09-12",
      amount: 150,
      description: "Mercado",
      creditCardId: "card1",
      invoiceId: "inv1",
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    assert.equal(accountBalance(bank, [purchase]), 2000);
    const flow = cashflowFromTransactions([purchase], 2026, 9);
    assert.equal(flow.expense, 150);
    const worth = netWorthLedger({
      accounts: [bank],
      transactions: [purchase],
      investments: [],
      invoices: [invoice],
      debts: [],
    });
    // 2000 ativos − 150 fatura = 1850
    assert.equal(worth, 1850);
  });

  it("pagamento de fatura reduz conta e quitação, sem nova despesa no fluxo", () => {
    const bank = account({ openingBalance: 2000 });
    const invoice: CreditCardInvoice = {
      id: "inv1",
      creditCardId: "card1",
      periodKey: "2026-09",
      closingDate: "2026-09-25",
      dueDate: "2026-10-05",
      status: "paid",
      paidAmount: 150,
      createdAt: now,
      updatedAt: now,
    };
    const purchase: Transaction = {
      id: "tx_c1",
      kind: "card_purchase",
      date: "2026-09-12",
      amount: 150,
      description: "Mercado",
      creditCardId: "card1",
      invoiceId: "inv1",
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    const payment: Transaction = {
      id: "tx_p1",
      kind: "invoice_payment",
      date: "2026-10-05",
      amount: 150,
      description: "Pagamento fatura",
      accountId: bank.id,
      creditCardId: "card1",
      invoiceId: "inv1",
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    assert.equal(accountBalance(bank, [purchase, payment]), 1850);
    const flowOct = cashflowFromTransactions([purchase, payment], 2026, 10);
    assert.equal(flowOct.expense, 0);
    const worth = netWorthLedger({
      accounts: [bank],
      transactions: [purchase, payment],
      investments: [],
      invoices: [invoice],
      debts: [],
    });
    // fatura paid não conta como passivo; PL = 1850
    assert.equal(worth, 1850);
  });

  it("migra schema 3 para ledger 4 preservando pontuais", () => {
    const raw = {
      schemaVersion: 3,
      updatedAt: now,
      incomes: [
        {
          id: "inc1",
          type: "salary",
          name: "Salário",
          amount: 5000,
          createdAt: now,
          updatedAt: now,
        },
      ],
      oneTimeIncomes: [],
      investments: [],
      recurringExpenses: [],
      oneTimeExpenses: [
        {
          id: "otx1",
          name: "Farmácia",
          amount: 40,
          date: "2026-09-01",
          createdAt: now,
          updatedAt: now,
        },
      ],
      installmentExpenses: [],
      debts: [],
      goals: [],
      categories: [],
      institutions: [],
    };
    const s = parseSnapshot(raw);
    assert.equal(s.schemaVersion, 6);
    assert.equal(s.accounts.length, 1);
    assert.equal(s.transactions.length, 1);
    assert.equal(s.transactions[0]!.kind, "expense");
    assert.equal(s.recurringRules.length, 1);
    assert.equal(s.recurringRules[0]!.kind, "income");
    assert.equal(s.oneTimeExpenses.length, 1);
  });

  it("createEmptySnapshot já nasce no schema 4 com conta", () => {
    const s = createEmptySnapshot(now);
    assert.equal(s.schemaVersion, 6);
    assert.ok(s.accounts.length >= 1);
    assert.deepEqual(s.transactions, []);
  });
});
