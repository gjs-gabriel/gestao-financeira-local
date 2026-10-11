import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractInstallmentsFromText,
  extractMoneyAmountsFromText,
  extractPurchaseOffersFromText,
  parsePurchaseNlPlanFromAi,
  planPurchaseFromNaturalLanguage,
} from "./purchase-nl";

describe("purchase-nl", () => {
  it("extrai valores e parcelas do texto", () => {
    const amounts = extractMoneyAmountsFromText(
      "Pix de R$ 8.000 ou 10× de R$ 9.000",
    );
    assert.deepEqual(amounts, [8000, 9000]);
    assert.equal(extractInstallmentsFromText("em 10 parcelas no cartão"), 10);
  });

  it("iPhone: Pix + 10× sem juros + 12× com acréscimo → 3 alternativas", () => {
    const text =
      "quero comprar um iphone 17 pro max. Atualmente tem uma promoção de 8999 no pix ou 9999 no cartão (até 10x sem juros ou 10200 em 12x). Qual é mais vantajoso, pix ou cartão( 10x ou 12x)?";
    const offers = extractPurchaseOffersFromText(text);
    assert.equal(offers.length, 3);
    const plan = planPurchaseFromNaturalLanguage(text);
    assert.equal(plan.alternatives.length, 3);
    assert.ok(plan.alternatives.some((a) => a.mode === "cash_reverse"));
    assert.ok(plan.alternatives.some((a) => a.mode === "installments_zero"));
    assert.ok(plan.alternatives.some((a) => a.mode === "installments_markup"));
    assert.equal(plan.cashPrice, 8999);
    assert.equal(plan.financedTotal, 9999);
    assert.equal(plan.maxInstallments, 12);
  });

  it("carro: Pix com desconto + sem juros + 12×/13× com acréscimo", () => {
    const text =
      "Quero comprar um carro de R$ 220.000. No Pix tem R$ 10.000 de desconto; no cartão posso parcelar R$ 220.000 sem juros, ou 12× (R$ 230.000) ou 13× (R$ 235.000).";
    const plan = planPurchaseFromNaturalLanguage(text);
    assert.equal(plan.cashPrice, 210000);
    assert.equal(plan.financedTotal, 220000);
    assert.equal(plan.alternatives.length, 4);
    const pix = plan.alternatives.find((a) => a.mode === "cash_reverse");
    assert.equal(pix?.amount, 210000);
    assert.ok(
      plan.alternatives.some(
        (a) => a.mode === "installments_zero" && a.amount === 220000,
      ),
    );
    assert.ok(
      plan.alternatives.some(
        (a) => a.mode === "installments_markup" && a.amount === 230000,
      ),
    );
    assert.ok(
      plan.alternatives.some(
        (a) => a.mode === "installments_markup" && a.amount === 235000,
      ),
    );
  });

  it("monta plano local com estratégias citadas", () => {
    const plan = planPurchaseFromNaturalLanguage(
      "Quero comparar à vista com parcela reversa de 8000 e parcelado sem juros de 9000 em 10x",
    );
    assert.ok(plan.cashPrice === 8000 || plan.alternatives.length >= 1);
    assert.ok(plan.alternatives.some((a) => a.mode === "cash_reverse"));
    assert.ok(plan.alternatives.some((a) => a.mode === "installments_zero"));
  });

  it("parseia JSON do Analista", () => {
    const plan = parsePurchaseNlPlanFromAi(`\`\`\`json
{
  "cashPrice": 8000,
  "financedTotal": 9000,
  "maxInstallments": 10,
  "urgency": "media",
  "alternatives": [
    { "mode": "cash_reverse", "amount": 8000, "installments": 10, "monthlyOutflow": 900 },
    { "mode": "subscription", "amount": 280, "installments": 12, "monthlyOutflow": 280 }
  ]
}
\`\`\``);
    assert.ok(plan);
    assert.equal(plan!.source, "ai");
    assert.equal(plan!.alternatives.length, 2);
    assert.equal(plan!.alternatives[1]!.mode, "subscription");
  });
});
