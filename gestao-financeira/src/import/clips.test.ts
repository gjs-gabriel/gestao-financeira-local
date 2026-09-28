import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmptySnapshot, createMarinaDemoSnapshot } from "@/domain";
import { applyImportDraft, buildImportDraft } from "@/domain/import";
import {
  analyzeImportDocument,
  buildFinancialImportDraft,
  commitImport,
  exportDraftCsv,
  ImportConfirmationRequiredError,
  validateImportDraft,
  type ParsedDocument,
} from "@/import";
import { validateImportFile } from "@/import/file-validation";

function sampleParsed(): ParsedDocument {
  return {
    documentType: "bank_statement",
    sourceKind: "csv",
    period: { start: "2026-09-01", end: "2026-09-30" },
    openingBalance: 4500,
    closingBalance: 9800,
    rows: [
      {
        id: "row-001",
        rawText: "05/09 IFOOD R$ 42,90",
        dateCandidate: "2026-09-05",
        amountCandidate: -42.9,
        descriptionCandidate: "IFOOD",
        typeHint: "expense",
      },
      {
        id: "row-002",
        rawText: "10/09 SALARIO R$ 9200,00",
        dateCandidate: "2026-09-10",
        amountCandidate: 9200,
        descriptionCandidate: "SALARIO",
        typeHint: "income",
      },
    ],
    warnings: [],
  };
}

describe("Clips import — parsing must NEVER modify financial state", () => {
  it("analyze + draft leave vault untouched", async () => {
    const snap = createEmptySnapshot();
    const before = JSON.stringify(snap);
    const parsed = sampleParsed();
    const ai = await analyzeImportDocument(parsed, { snapshot: snap });
    buildFinancialImportDraft({
      parsed,
      ai,
      fileName: "test.csv",
      userSessionId: "user-a",
      snapshot: snap,
    });
    assert.equal(JSON.stringify(snap), before);
  });
});

describe("Clips import — only explicit confirmation commits", () => {
  it("throws without confirmation", async () => {
    const snap = createEmptySnapshot();
    const parsed = sampleParsed();
    const ai = await analyzeImportDocument(parsed, { snapshot: snap });
    const draft = buildFinancialImportDraft({
      parsed,
      ai,
      fileName: "test.csv",
      userSessionId: "user-a",
      snapshot: snap,
    });
    assert.throws(
      () =>
        commitImport({
          draft,
          snapshot: snap,
          confirmation: {
            confirmed: true,
            checkboxChecked: true,
            selectedIds: draft.transactions.map((t) => t.id),
            userSessionId: "user-a",
          },
          activeUserSessionId: "user-a",
          vaultUnlocked: false,
        }),
      ImportConfirmationRequiredError,
    );
  });

  it("commits only after confirmation with unlocked vault", async () => {
    const snap = createEmptySnapshot();
    const parsed = sampleParsed();
    const ai = await analyzeImportDocument(parsed, { snapshot: snap });
    const draft = buildFinancialImportDraft({
      parsed,
      ai,
      fileName: "test.csv",
      userSessionId: "user-a",
      snapshot: snap,
    });
    for (const t of draft.transactions) {
      t.include = true;
      t.duplicate = false;
      t.errors = [];
      t.status = "ready";
    }
    const { result, snapshot: next } = commitImport({
      draft,
      snapshot: snap,
      confirmation: {
        confirmed: true,
        checkboxChecked: true,
        selectedIds: draft.transactions.map((t) => t.id),
        userSessionId: "user-a",
      },
      activeUserSessionId: "user-a",
      vaultUnlocked: true,
    });
    assert.ok(result.count >= 1);
    assert.notEqual(JSON.stringify(next), JSON.stringify(snap));
  });

  it("rejects draft from another user", async () => {
    const snap = createEmptySnapshot();
    const parsed = sampleParsed();
    const ai = await analyzeImportDocument(parsed, { snapshot: snap });
    const draft = buildFinancialImportDraft({
      parsed,
      ai,
      fileName: "test.csv",
      userSessionId: "user-a",
      snapshot: snap,
    });
    assert.throws(() =>
      commitImport({
        draft,
        snapshot: snap,
        confirmation: {
          confirmed: true,
          checkboxChecked: true,
          selectedIds: draft.transactions.map((t) => t.id),
          userSessionId: "user-a",
        },
        activeUserSessionId: "user-b",
        vaultUnlocked: true,
      }),
    );
  });
});

describe("Clips categorization + validation", () => {
  it("IFOOD → Alimentação com alta confiança", async () => {
    const ai = await analyzeImportDocument(sampleParsed());
    const ifood = ai.transactions.find((t) => t.sourceRowId === "row-001");
    assert.ok(ifood);
    assert.equal(ifood!.categorySuggestion, "Alimentação");
    assert.ok(ifood!.confidence >= 0.9);
  });

  it("validates balance when present", async () => {
    const snap = createEmptySnapshot();
    const parsed = sampleParsed();
    // opening 4500 + 9200 - 42.9 = 13657.1 ≠ 9800 → warning
    const ai = await analyzeImportDocument(parsed);
    const draft = buildFinancialImportDraft({
      parsed,
      ai,
      fileName: "x.csv",
      userSessionId: "u",
      snapshot: snap,
    });
    const v = validateImportDraft(draft);
    assert.equal(v.balanceCheck.applicable, true);
    assert.equal(v.balanceCheck.ok, false);
  });

  it("exports CSV without writing vault", async () => {
    const snap = createMarinaDemoSnapshot();
    const before = snap.oneTimeExpenses.length;
    const parsed = sampleParsed();
    const ai = await analyzeImportDocument(parsed, { snapshot: snap });
    const draft = buildFinancialImportDraft({
      parsed,
      ai,
      fileName: "x.csv",
      userSessionId: "u",
      snapshot: snap,
    });
    const csv = exportDraftCsv(draft);
    assert.ok(csv.includes("date,description,amount"));
    assert.ok(csv.includes("IFOOD"));
    assert.equal(snap.oneTimeExpenses.length, before);
  });
});

describe("file validation", () => {
  it("rejects empty file", async () => {
    const file = new File([], "a.csv", { type: "text/csv" });
    const r = await validateImportFile(file);
    assert.equal(r.ok, false);
  });

  it("accepts PDF magic bytes", async () => {
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([content], "e.pdf", { type: "application/pdf" });
    const r = await validateImportFile(file);
    assert.equal(r.ok, true);
    assert.equal(r.kind, "pdf");
  });
});

describe("legacy import still works", () => {
  it("applyImportDraft still available", () => {
    const s = createEmptySnapshot();
    const draft = buildImportDraft(s, [
      {
        rowIndex: 0,
        date: "2026-09-01",
        description: "Teste",
        amount: -10,
      },
    ]);
    draft[0]!.include = true;
    draft[0]!.duplicate = false;
    draft[0]!.amount = 10;
    draft[0]!.kind = "expense";
    const result = applyImportDraft(s, draft);
    assert.equal(result.addedExpenses, 1);
  });
});
