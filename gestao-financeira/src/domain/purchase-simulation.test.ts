import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePctOfCdi,
  simulatePurchase,
  simulatePurchaseAlternatives,
  recommendPurchaseStrategies,
  solveImpliedMonthlyRate,
  annualToMonthly,
  embeddedMarkupPercent,
  PURCHASE_MODE_LABELS,
} from "./purchase-simulation";

describe("purchase-simulation", () => {
  it("parsePctOfCdi lê 120% do CDI", () => {
    assert.equal(parsePctOfCdi("Caixinha 120% do CDI"), 120);
    assert.equal(parsePctOfCdi("CDB 110% CDI 2027"), 110);
    assert.equal(parsePctOfCdi("sem taxa"), null);
  });

  it("inferSourceYieldAssumptions preenche por classe e conta", async () => {
    const { inferSourceYieldAssumptions } = await import("./purchase-simulation");
    const rf = inferSourceYieldAssumptions({
      kind: "investment",
      name: "CDB / Tesouro Selic",
      classificationOrType: "renda_fixa",
    });
    assert.equal(rf.pctOfCdi, 100);
    assert.ok(rf.irRate > 0);

    const named = inferSourceYieldAssumptions({
      kind: "investment",
      name: "Caixinha 120% do CDI",
      classificationOrType: "renda_fixa",
    });
    assert.equal(named.pctOfCdi, 120);

    const checking = inferSourceYieldAssumptions({
      kind: "account",
      name: "Conta corrente",
      classificationOrType: "checking",
    });
    assert.equal(checking.pctOfCdi, 0);
    assert.equal(checking.irRate, 0);
  });

  it("embeddedMarkupPercent e solveImpliedMonthlyRate", () => {
    assert.equal(embeddedMarkupPercent(8000, 9000), 12.5);
    const cash = 8000;
    const n = 10;
    const financed = 9000;
    const pmt = financed / n;
    const i = solveImpliedMonthlyRate(cash, pmt, n);
    assert.ok(i != null && i > 0);
    const factor = (1 - Math.pow(1 + i!, -n)) / i!;
    const pv = pmt * factor;
    assert.ok(Math.abs(pv - cash) < 1);
  });

  it("exemplo do brief: nomes amigáveis e ranking A vs B", () => {
    const r = simulatePurchase({
      cashPrice: 8000,
      financedTotal: 9000,
      installments: 10,
      investmentName: "Caixinha Reserva",
      investmentBalance: 20000,
      pctOfCdi: 120,
      cdiAnnual: 0.1415,
      irRate: 0.175,
      monthlySavings: 750,
      horizonMonths: 12,
      cashLabel: "Pix à vista",
      financedLabel: "Cartão 10x",
    });
    assert.equal(r.alternatives.length, 2);
    assert.equal(r.alternatives[0]?.name, "Pix à vista");
    assert.equal(r.alternatives[1]?.name, "Cartão 10x");
    assert.ok(r.markdownReport.includes("Pix à vista"));
    assert.ok(r.bestId);
    assert.ok(r.embeddedMarkupPct != null && r.embeddedMarkupPct > 0);
    assert.ok(r.recommendedAction.length > 10);
  });

  it("Cenário A usa parcela reversa (VALOR_A_PRAZO / N)", () => {
    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Reserva",
        investmentBalance: 20000,
        pctOfCdi: 100,
        cdiAnnual: 0.12,
        irRate: 0.175,
        monthlySavings: 0,
        horizonMonths: 12,
        referenceCashPrice: 8000,
        referenceFinancedTotal: 9000,
      },
      [
        {
          id: "a",
          name: "Parcela reversa",
          mode: "cash_reverse",
          amount: 8000,
          installments: 10,
          monthlyOutflow: 900,
        },
      ],
    );
    const a = r.alternatives[0]!;
    // M0 = 12000; 10 meses de +900 com juros; depois 2 meses só juros
    assert.equal(a.months[0]!.investmentBalance, 12000);
    assert.ok(a.finalInvestment > 12000);
  });

  it("aporte 0 explícito na parcela reversa não vira auto (a prazo ÷ N)", () => {
    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Reserva",
        investmentBalance: 20000,
        pctOfCdi: 100,
        cdiAnnual: 0.12,
        irRate: 0.175,
        monthlySavings: 0,
        horizonMonths: 12,
        referenceCashPrice: 8000,
        referenceFinancedTotal: 9000,
      },
      [
        {
          id: "com_aporte",
          name: "Com aporte",
          mode: "cash_reverse",
          amount: 8000,
          installments: 10,
          monthlyOutflow: 900,
        },
        {
          id: "sem_aporte",
          name: "Sem aporte",
          mode: "cash_reverse",
          amount: 8000,
          installments: 12,
          monthlyOutflow: 0,
        },
      ],
    );
    const com = r.alternatives.find((a) => a.id === "com_aporte")!;
    const sem = r.alternatives.find((a) => a.id === "sem_aporte")!;
    assert.equal(com.monthlyOutflow, 900);
    assert.equal(sem.monthlyOutflow, 0);
    assert.ok(com.finalInvestment > sem.finalInvestment + 100);
    assert.equal(r.verdict, "ranked");
    assert.equal(r.bestId, "com_aporte");
    assert.ok(!/empate técnico/i.test(r.verdictTitle));
  });

  it("Cenário B: saldo só rende (sem aporte) ≈ Saldo*(1+líquido)", () => {
    const saldo = 20000;
    const bruto = 0.12;
    const ir = 0.175;
    const liquido = bruto * (1 - ir);
    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Reserva",
        investmentBalance: saldo,
        pctOfCdi: 100,
        cdiAnnual: bruto,
        irRate: ir,
        monthlySavings: 1000,
        horizonMonths: 12,
        referenceCashPrice: 8000,
        referenceFinancedTotal: 8000,
      },
      [
        {
          id: "b",
          name: "Parcelado 0%",
          mode: "installments_zero",
          amount: 8000,
          installments: 10,
        },
      ],
    );
    const expected = saldo * (1 + liquido);
    assert.ok(Math.abs(r.alternatives[0]!.finalInvestment - expected) < 0.05);
  });

  it("recommendPurchaseStrategies avalia as estratégias", () => {
    const r = recommendPurchaseStrategies({
      investmentName: "Reserva",
      investmentBalance: 40000,
      pctOfCdi: 120,
      cdiAnnual: 0.1415,
      irRate: 0.175,
      monthlySavings: 1000,
      horizonMonths: 12,
      cashPrice: 10000,
      financedTotal: 10000,
      maxInstallments: 10,
      urgency: "media",
    });
    assert.equal(r.alternatives.length, Object.keys(PURCHASE_MODE_LABELS).length);
    for (const mode of Object.keys(PURCHASE_MODE_LABELS)) {
      assert.ok(
        r.alternatives.some((a) => a.mode === mode),
        `faltou ${mode}`,
      );
    }
    const fin = r.alternatives.find((a) => a.mode === "financing_interest");
    assert.ok(fin?.monthlyRatePct != null && fin.monthlyRatePct > 0);
    assert.ok(r.facts.VALOR_A_VISTA === 10000);
    assert.ok(r.markdownReport.includes("Alerta") || r.markdownReport.includes("Arbitragem"));
  });

  it("parcelamento com acréscimo penaliza vs sem juros; financiamento usa taxa", async () => {
    const { pricePayment } = await import("./purchase-simulation");
    const pmt = pricePayment(8000, 0.0179, 12);
    assert.ok(pmt > 8000 / 12);

    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Reserva",
        investmentBalance: 30000,
        pctOfCdi: 100,
        cdiAnnual: 0.12,
        irRate: 0.15,
        monthlySavings: 500,
        horizonMonths: 12,
        referenceCashPrice: 8000,
        referenceFinancedTotal: 9000,
      },
      [
        {
          id: "zero",
          name: "Sem juros",
          mode: "installments_zero",
          amount: 8000,
          installments: 10,
        },
        {
          id: "markup",
          name: "Com acréscimo",
          mode: "installments_markup",
          amount: 10200,
          installments: 12,
        },
        {
          id: "fin",
          name: "Financiamento",
          mode: "financing_interest",
          amount: 8000,
          installments: 12,
          monthlyRatePct: 1.79,
        },
      ],
    );
    const zero = r.alternatives.find((a) => a.id === "zero")!;
    const markup = r.alternatives.find((a) => a.id === "markup")!;
    const fin = r.alternatives.find((a) => a.id === "fin")!;
    assert.ok(zero.scoreWealth > markup.scoreWealth);
    assert.equal(fin.monthlyRatePct, 1.79);
    assert.ok(fin.amount > 8000);
    assert.ok(fin.monthlyOutflow > 8000 / 12);
  });

  it("aceita uma única alternativa", () => {
    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Reserva",
        investmentBalance: 20000,
        pctOfCdi: 120,
        cdiAnnual: 0.14,
        irRate: 0.15,
        monthlySavings: 800,
        horizonMonths: 12,
        referenceCashPrice: 8000,
        referenceFinancedTotal: 8000,
      },
      [
        {
          id: "solo",
          name: "Só à vista",
          mode: "cash_reverse",
          amount: 8000,
          installments: 10,
          monthlyOutflow: 800,
        },
      ],
    );
    assert.equal(r.alternatives.length, 1);
    assert.equal(r.bestId, "solo");
    assert.ok(r.automation);
  });

  it("normaliza modos legados", () => {
    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Reserva",
        investmentBalance: 30000,
        pctOfCdi: 100,
        cdiAnnual: 0.12,
        irRate: 0.15,
        monthlySavings: 500,
        horizonMonths: 12,
      },
      [
        {
          id: "old",
          name: "legado",
          mode: "cash_replenish",
          amount: 5000,
          installments: 5,
          monthlyOutflow: 1000,
        },
      ],
    );
    assert.equal(r.alternatives[0]?.mode, "cash_reverse");
  });

  it("annualToMonthly é coerente", () => {
    const m = annualToMonthly(0.12);
    assert.ok(m > 0 && m < 0.12);
    const back = Math.pow(1 + m, 12) - 1;
    assert.ok(Math.abs(back - 0.12) < 1e-10);
  });

  it("CC sem saldo/limite: ranking hipotético + alertas (sem reordenar)", () => {
    const r = simulatePurchaseAlternatives(
      {
        investmentName: "Conta corrente",
        investmentBalance: 14070,
        pctOfCdi: 0,
        cdiAnnual: 0.1415,
        irRate: 0,
        monthlySavings: 0,
        horizonMonths: 12,
        referenceCashPrice: 210000,
        referenceFinancedTotal: 220000,
        cards: [
          { id: "c1", name: "Visa", available: 5000, limit: 8000 },
        ],
      },
      [
        {
          id: "pix",
          name: "Pix",
          mode: "cash_reverse",
          amount: 210000,
          installments: 10,
        },
        {
          id: "zero",
          name: "Cartão sem juros",
          mode: "installments_zero",
          amount: 220000,
          installments: 10,
        },
        {
          id: "m12",
          name: "12x",
          mode: "installments_markup",
          amount: 230000,
          installments: 12,
        },
      ],
    );
    // Ranking permanece pelo score (Pix pode ser 1º even sem saldo)
    assert.equal(r.bestId, "pix");
    assert.equal(r.alternatives.find((a) => a.id === "pix")?.feasible, false);
    assert.equal(r.alternatives.find((a) => a.id === "zero")?.feasible, false);
    assert.ok(r.liquidityAlerts.some((a) => a.id === "hypothetical"));
    assert.ok(r.liquidityAlerts.some((a) => a.id === "cash:pix"));
    assert.ok(r.liquidityAlerts.some((a) => a.id.startsWith("card:")));
    assert.ok(/hipotética/i.test(r.verdictTitle));
  });
});
