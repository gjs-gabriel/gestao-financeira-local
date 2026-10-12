import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluggyFetchBundle } from "@/infra/pluggy/types";
import { categoryTrendChart, createEmptySnapshot, futureInstallmentSeries } from "../index";
import { applyPluggyMappedBundle } from "../pluggy-sync";
import { mapPluggyBundle } from "./pluggy-mapper";

const NOW = "2026-03-15T12:00:00.000Z";

function fixtureBundle(): PluggyFetchBundle {
  return {
    fetchedAt: NOW,
    items: [
      {
        itemId: "item-1",
        accounts: [
          {
            id: "acc-bank",
            type: "BANK",
            subtype: "CHECKING_ACCOUNT",
            name: "Conta Corrente",
            balance: 5000,
            currencyCode: "BRL",
            itemId: "item-1",
          },
          {
            id: "acc-card",
            type: "CREDIT",
            subtype: "CREDIT_CARD",
            name: "Cartão Teste",
            balance: 800,
            currencyCode: "BRL",
            itemId: "item-1",
            creditData: {
              creditLimit: 5000,
              balanceDueDate: "2026-03-20",
              balanceCloseDate: "2026-03-10",
            },
          },
        ],
        transactions: [
          {
            id: "tx-food-1",
            accountId: "acc-bank",
            date: "2026-03-01",
            description: "Restaurante A",
            amount: -80,
            type: "DEBIT",
            category: "Restaurants",
          },
          {
            id: "tx-food-2",
            accountId: "acc-bank",
            date: "2026-03-05",
            description: "Restaurante B",
            amount: -120,
            type: "DEBIT",
            category: "Restaurants",
          },
          {
            id: "tx-transport",
            accountId: "acc-bank",
            date: "2026-03-08",
            description: "Uber",
            amount: -40,
            type: "DEBIT",
            category: "Transportation",
          },
          {
            id: "tx-inst-1",
            accountId: "acc-card",
            date: "2026-02-01",
            description: "Notebook Parcelado",
            amount: -250,
            type: "DEBIT",
            category: "Other",
            creditCardMetadata: {
              installmentNumber: 1,
              totalInstallments: 4,
            },
          },
          {
            id: "tx-inst-2",
            accountId: "acc-card",
            date: "2026-03-01",
            description: "Notebook Parcelado",
            amount: -250,
            type: "DEBIT",
            category: "Other",
            creditCardMetadata: {
              installmentNumber: 2,
              totalInstallments: 4,
            },
          },
        ],
        investments: [],
        bills: [],
        loans: [],
      },
    ],
  };
}

describe("pluggy-mapper", () => {
  it("mapeia transações para oneTime e alimenta top categorias", () => {
    const mapped = mapPluggyBundle(fixtureBundle(), NOW);
    assert.equal(mapped.oneTimeExpenses.length, 3);
    assert.ok(
      mapped.oneTimeExpenses.every((e) => e.categoryId === "cat-alimentacao" || e.categoryId === "cat-transporte"),
    );

    let snapshot = createEmptySnapshot(NOW);
    snapshot = applyPluggyMappedBundle(snapshot, mapped, {
      itemIds: ["item-1"],
      fetchedAt: NOW,
    });

    const chart = categoryTrendChart(snapshot, 2026, 3, 1, 5);
    const food = chart.series.find((s) => s.categoryId === "cat-alimentacao");
    assert.ok(food, "categoria alimentação deve aparecer no top");
    const foodTotal = chart.points.reduce(
      (sum, p) => sum + (p.values["cat-alimentacao"] ?? 0),
      0,
    );
    assert.equal(foodTotal, 200);
  });

  it("agrupa parcelas e alimenta futureInstallmentSeries", () => {
    const mapped = mapPluggyBundle(fixtureBundle(), NOW);
    assert.equal(mapped.installmentExpenses.length, 1);
    const plan = mapped.installmentExpenses[0]!;
    assert.equal(plan.totalInstallments, 4);
    assert.equal(plan.installmentAmount, 250);
    assert.equal(plan.startDate, "2026-02-01");

    let snapshot = createEmptySnapshot(NOW);
    snapshot = applyPluggyMappedBundle(snapshot, mapped, {
      itemIds: ["item-1"],
      fetchedAt: NOW,
    });

    const series = futureInstallmentSeries(snapshot, 2026, 2, 4);
    const nonzero = series.filter((p) => p.parcelas > 0);
    assert.ok(nonzero.length >= 3, "deve haver carga nos meses do plano");
    assert.ok(series.every((p) => p.parcelas === 0 || p.parcelas === 250));
  });

  it("sanitiza descrição com payload XSS na ingestão", () => {
    const dirty = structuredClone(fixtureBundle()) as ReturnType<
      typeof fixtureBundle
    >;
    dirty.items[0]!.transactions[0]!.description =
      `<img src=x onerror="alert(1)">PADARIA`;
    const mapped = mapPluggyBundle(dirty, NOW);
    const names = mapped.oneTimeExpenses.map((e) => e.name);
    assert.ok(names.some((n) => n.includes("PADARIA")));
    assert.ok(names.every((n) => !n.includes("<") && !n.includes(">")));
    assert.ok(names.every((n) => !n.includes('"')));
  });
});
