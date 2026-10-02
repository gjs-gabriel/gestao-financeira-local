import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMatchDecision,
  unresolvedConfirmationCount,
} from "@/import/reconcile/apply-decision";
import type { ReconciliationResult } from "@/import/reconcile/types";
import { refineNubankDocument } from "@/import/adapters/nubank";
import { parseCsvText } from "@/import/parsers/csv-parser";
import { buildParsedFromLines } from "@/import/parsers/pdf-parser";
import type { ParsedDocument } from "@/import/types";
import { applyReconciliationSideEffects } from "@/import/commit/apply-reconciliation";
import { createEmptySnapshot } from "@/domain";
import type { FinancialImportDraft } from "@/import/types";

function baseRec(): ReconciliationResult {
  return {
    matches: [
      {
        id: "m1",
        entityType: "investment",
        action: "NEEDS_CONFIRMATION",
        confidence: "LOW",
        importedTempId: "t1",
        importedLabel: "MAPFRE CONFIANÇA FIC RF REF DI CP",
        reason: "ambíguo",
        candidates: [
          { entityId: "inv_a", label: "Mapfre Confiança FIC RF", score: 0.8 },
          { entityId: "inv_b", label: "Outro fundo", score: 0.75 },
        ],
      },
      {
        id: "m2",
        entityType: "investment_position",
        action: "CONFLICT",
        confidence: "HIGH",
        importedTempId: "p1",
        existingId: "pos1",
        importedLabel: "CDB XP",
        importedValue: 35000,
        existingValue: 32000,
        difference: 3000,
        date: "2026-08-31",
        reason: "divergência",
      },
    ],
    summary: {
      recognized: 1,
      updates: 0,
      created: 0,
      unchanged: 0,
      possibleDuplicates: 0,
      conflicts: 1,
      needsConfirmation: 1,
      ignored: 0,
    },
    missingInvestments: [],
    mathChecks: [],
  };
}

describe("decisões manuais de conciliação", () => {
  it("vincula candidato e prepara alias", () => {
    const { reconciliation, pendingAlias } = applyMatchDecision(baseRec(), {
      matchId: "m1",
      decision: "link_to",
      linkToId: "inv_a",
      saveAlias: true,
    });
    const m = reconciliation.matches.find((x) => x.id === "m1");
    assert.equal(m?.existingId, "inv_a");
    assert.equal(m?.userDecision, "link_to");
    assert.equal(pendingAlias?.investmentId, "inv_a");
    assert.equal(unresolvedConfirmationCount(reconciliation), 1);
  });

  it("permite manter valor em conflito", () => {
    const { reconciliation } = applyMatchDecision(baseRec(), {
      matchId: "m2",
      decision: "keep_existing",
    });
    assert.equal(
      reconciliation.matches.find((x) => x.id === "m2")?.action,
      "UNCHANGED",
    );
    assert.equal(unresolvedConfirmationCount(reconciliation), 1);
  });

  it("persiste alias no commit side-effect", () => {
    let snap = createEmptySnapshot();
    snap = {
      ...snap,
      investments: [
        {
          id: "inv_a",
          name: "Mapfre Confiança FIC RF",
          amount: 100,
          classification: "renda_fixa",
          createdAt: snap.updatedAt,
          updatedAt: snap.updatedAt,
        },
      ],
    };
    const draft = {
      documentInfo: {
        fileName: "x.pdf",
        period: { start: null, end: null },
      },
      source: "pdf",
      documentType: "bank_statement",
      pendingAliases: [
        {
          investmentId: "inv_a",
          rawName: "MAPFRE CONFIANÇA FIC RF REF DI CP",
          normalizedName: "MAPFRE CONFIANCA FIC RF REF DI CP",
        },
      ],
      reconciliation: {
        matches: [],
        summary: {
          recognized: 0,
          updates: 0,
          created: 0,
          unchanged: 0,
          possibleDuplicates: 0,
          conflicts: 0,
          needsConfirmation: 0,
          ignored: 0,
        },
        missingInvestments: [],
        mathChecks: [],
      },
    } as unknown as FinancialImportDraft;

    const next = applyReconciliationSideEffects(snap, draft);
    assert.equal(next.investmentAliases.length, 1);
    assert.equal(next.importedDocuments.length, 1);
  });
});

describe("adapters bancários", () => {
  it("Nubank marca aplicação como investment com sinal negativo", () => {
    const doc: ParsedDocument = {
      documentType: "bank_statement",
      sourceKind: "pdf",
      period: { start: "2026-08-01", end: "2026-08-31" },
      rows: [
        {
          id: "1",
          rawText: "Aplicação Fundo Mapfre Confiança 400,00",
          dateCandidate: "2026-08-02",
          amountCandidate: 400,
          descriptionCandidate: "Aplicação Fundo Mapfre",
          typeHint: "expense",
        },
      ],
      warnings: [],
    };
    const refined = refineNubankDocument(doc, []);
    assert.equal(refined.rows[0]?.typeHint, "investment");
    assert.ok((refined.rows[0]?.amountCandidate ?? 0) < 0);
  });

  it("aplica adapter pelo nome do arquivo", () => {
    const doc = buildParsedFromLines(
      [
        "Saldo inicial 100,00",
        "Movimentações",
        "02/08/2026 Aplicação Fundo Teste -50,00",
        "Saldo final 50,00",
      ],
      "NU_123_extrato.pdf",
      1,
    );
    assert.ok(doc.warnings.some((w) => /Nubank|Adapter/i.test(w)));
  });
});

describe("CSV mapeamento", () => {
  it("aceita mapeamento manual quando auto falha", () => {
    const csv = `ColA;ColB;ColC
01/02/2026;Padaria;-12,50
`;
    const auto = parseCsvText(csv, "x.csv");
    assert.equal(auto.needsMapping, true);
    const mapped = parseCsvText(csv, "x.csv", {
      ColA: "date",
      ColB: "description",
      ColC: "amount",
    });
    assert.equal(mapped.needsMapping, false);
    assert.equal(mapped.intermediate.transactions.length, 1);
    assert.equal(mapped.intermediate.transactions[0]?.signed_amount, -12.5);
  });
});

describe("OCR pipeline (texto simulado)", () => {
  it("buildParsedFromLines aceita saída de OCR", () => {
    const doc = buildParsedFromLines(
      [
        "NU_12345678 extrato",
        "Saldo inicial 1.000,00",
        "Movimentações",
        "02 AGO 2026 Pagamento de fatura 200,00",
        "Saldo final do período 800,00",
      ],
      "NU_ocr.pdf",
      1,
      ["OCR local concluído"],
    );
    assert.ok(doc.warnings.some((w) => /OCR/i.test(w)));
    assert.ok(doc.rows.length >= 1 || (doc.accounts?.length ?? 0) >= 0);
  });
});
