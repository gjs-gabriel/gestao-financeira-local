import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountBalance, createEmptySnapshot, upsertEntity } from "@/domain";
import type { Account } from "@/domain/ledger-types";
import {
  analyzeImportDocument,
  buildFinancialImportDraft,
  commitImport,
  rollbackImport,
  validateImportDraft,
} from "@/import";
import { analyzeFinancialDocument } from "@/import/parsers/br-document";
import { gfinAccountMarker } from "@/import/commit/apply-document-balances";

const PICPAY = [
  "Informe de rendimentos financeiros",
  "Pessoa física 2025",
  "Fonte pagadora 1/2:",
  "Picpay Instituição de Pagamento S/A",
  "Grupo de bens: 06 - Depósito à vista e numerário",
  "Código: 01 - Depósito em conta corrente ou conta pagamento",
  "Agência Conta DV Saldo em 31/12/2024 Saldo em 31/12/2025",
  "1 12345678 0 R$ 10,00 R$ 25,50",
  "Rendimentos Sujeitos à Tributação Exclusiva",
  "Valor",
  "R$ 0,00",
  "Fonte pagadora 2/2:",
  "PicPay Bank Banco Multiplo S.A.",
  "Grupo de bens: 04 - Aplicações e investimentos",
  "Código: 02 - Títulos públicos e privados sujeitos à tributação (Tesouro Direto, CDB, RDB...)",
  "Saldo em 31/12/2024 Saldo em 31/12/2025",
  "Conta e Cofrinhos R$ 1.000,00 R$ 1.250,00",
  "Rendimentos Sujeitos à Tributação Exclusiva",
  "Conta e cofrinhos R$ 80,00",
];

const NUBANK = [
  "Agência 0001 Conta",
  "1234567-8",
  "01 DE AGOSTO DE 2026 a 31 DE AGOSTO DE 2026 VALORES EM R$",
  "Saldo inicial 1.000,00",
  "Rendimento líquido +10,00",
  "Saldo final do período",
  "Total de entradas +0,00",
  "R$ 410,00",
  "Total de saídas -600,00",
  "Saldo final do período 410,00",
  "Movimentações",
  "02 AGO 2026 Total de saídas - 400,00",
  "Aplicação Fundo Mapfre Confianza FIF RF REF DI CP - Resp. Ltda 400,00",
  "24 AGO 2026 Total de saídas - 200,00",
  "Pagamento de fatura 200,00",
  "O saldo líquido corresponde ao total de depósitos e rendimentos em conta.",
];

describe("informe de rendimentos", () => {
  it("identifica PicPay, conta e cofrinho pelo saldo de 31/12", () => {
    const doc = analyzeFinancialDocument(PICPAY, "informe-de-rendimentos-2025.pdf");
    assert.equal(doc.recognized, true);
    assert.equal(doc.documentType, "income_report");
    assert.equal(doc.institution?.institutionId, "inst-picpay");
    assert.equal(doc.rows.length, 0);
    assert.equal(doc.accounts?.length, 1);
    assert.equal(doc.accounts?.[0]?.accountNumber, "12345678-0");
    assert.equal(doc.accounts?.[0]?.agency, "1");
    assert.equal(doc.accounts?.[0]?.closingBalance, 25.5);
    assert.equal(doc.accounts?.[0]?.asOf, "2025-12-31");
    assert.equal(doc.holdings?.length, 1);
    assert.equal(doc.holdings?.[0]?.name, "Conta e Cofrinhos");
    assert.equal(doc.holdings?.[0]?.amount, 1250);
    assert.equal(doc.holdings?.[0]?.classification, "renda_fixa");
    assert.match(doc.holdings?.[0]?.notes ?? "", /80,00|80.00|R\$\s*80/);
  });
});

const INTER = [
  "Informe de rendimentos financeiros - Ano calendário 2025",
  "Conta Corrente",
  "Grupo 06 - Depósito à vista e numerário",
  "Código 01 - Depósito em conta corrente ou conta pagamento",
  "CNPJ Descrição Agência Conta Situação em dez/2024 Situação em dez/2025",
  "00.416.968/0001-01 Saldo em CC 0001 11223344-5 R$ 10,00 R$ 20,00",
  "Renda Fixa",
  "Grupo 04 - Aplicações e Investimentos",
  "CNPJ Descrição Situação em dez/2024 Situação em dez/2025",
  "00.416.968/0001-01 Banco Inter - Tributado R$ 30,00 R$ 40,00",
  "00.416.968/0001-01 Banco Inter - Aplicação Automática - Tributado R$ 100,00 R$ 150,00",
  "00.416.968/0001-01 Banco Inter - Isento R$ 5,00 R$ 8,00",
  "Fundos de Investimento",
  "Grupo 07 - Fundos",
  "CNPJ Descrição Situação em dez/2024 Situação em dez/2025",
  "09.720.710/0001-60 INTER CONSERVADOR PLUS FIF RENDA FI R$ 1,00 R$ 2,50",
  "Rendimentos isentos e não tributáveis",
  "00.416.968/0001-01 BANCO INTER S.A. R$ 3,00",
  "Rendimentos sujeitos à tributação exclusiva",
  "00.416.968/0001-01 BANCO INTER S.A. R$ 4,00",
  "Fundos de Investimento",
  "09.720.710/0001-60 INTER CONSERVADOR PLUS FIF RENDA FI R$ 0,50",
];

describe("informe do Inter", () => {
  it("lê conta, renda fixa e fundo pela situação em dezembro", () => {
    const doc = analyzeFinancialDocument(INTER, "informe-inter.pdf");
    assert.equal(doc.recognized, true);
    assert.equal(doc.institution?.institutionId, "inst-inter");
    assert.equal(doc.accounts?.length, 1);
    assert.equal(doc.accounts?.[0]?.agency, "0001");
    assert.equal(doc.accounts?.[0]?.accountNumber, "11223344-5");
    assert.equal(doc.accounts?.[0]?.closingBalance, 20);
    assert.equal(doc.accounts?.[0]?.asOf, "2025-12-31");
    const byName = new Map((doc.holdings ?? []).map((item) => [item.name, item]));
    assert.equal(byName.get("Banco Inter - Tributado")?.amount, 40);
    assert.equal(byName.get("Banco Inter - Tributado")?.classification, "renda_fixa");
    assert.equal(
      byName.get("Banco Inter - Aplicação Automática - Tributado")?.amount,
      150,
    );
    assert.equal(byName.get("Banco Inter - Isento")?.amount, 8);
    assert.match(byName.get("Banco Inter - Isento")?.notes ?? "", /3,00|3\.00/);
    assert.match(byName.get("Banco Inter - Tributado")?.notes ?? "", /4,00|4\.00/);
    assert.equal(byName.get("INTER CONSERVADOR PLUS FIF RENDA FI")?.amount, 2.5);
    assert.match(
      byName.get("INTER CONSERVADOR PLUS FIF RENDA FI")?.notes ?? "",
      /0,50|0\.50/,
    );
    assert.equal(doc.rows.length, 0);
  });
});

describe("extrato Nubank", () => {
  it("separa saldo, rendimento, fatura e aplicação", async () => {
    const doc = analyzeFinancialDocument(
      NUBANK,
      "NU_12345678_01AGO2026_31AGO2026.pdf",
    );
    assert.equal(doc.institution?.institutionId, "inst-nubank");
    assert.equal(doc.accounts?.[0]?.accountNumber, "1234567-8");
    assert.equal(doc.accounts?.[0]?.agency, "0001");
    assert.equal(doc.accounts?.[0]?.openingBalance, 1000);
    assert.equal(doc.accounts?.[0]?.closingBalance, 410);
    assert.equal(doc.period.start, "2026-08-01");
    assert.equal(doc.period.end, "2026-08-31");

    const ai = await analyzeImportDocument(doc);
    const draft = buildFinancialImportDraft({
      parsed: doc,
      ai,
      fileName: "NU_12345678_01AGO2026_31AGO2026.pdf",
      userSessionId: "user-a",
      snapshot: createEmptySnapshot(),
    });
    const validation = validateImportDraft(draft);
    assert.equal(validation.balanceCheck.ok, true);
    const fund = draft.transactions.find((tx) => tx.type === "investment");
    assert.ok(fund);
    assert.equal(fund?.signedAmount, -400);
    assert.match(fund?.holdingName ?? "", /Mapfre/);
    assert.ok(draft.transactions.some((tx) => tx.type === "income" && tx.amount === 10));
    assert.ok(
      draft.transactions.some(
        (tx) => tx.type === "expense" && tx.description.includes("fatura"),
      ),
    );
  });
});

describe("commit de saldos", () => {
  it("cadastra conta e aplicação do informe e não duplica na segunda vez", () => {
    const doc = analyzeFinancialDocument(PICPAY, "informe.pdf");
    const snap = createEmptySnapshot();
    const ai = { transactions: [], usedAI: false };
    const draft = buildFinancialImportDraft({
      parsed: doc,
      ai,
      fileName: "informe.pdf",
      userSessionId: "user-a",
      snapshot: snap,
    });
    const first = commitImport({
      draft,
      snapshot: snap,
      confirmation: {
        confirmed: true,
        checkboxChecked: true,
        selectedIds: [],
        userSessionId: "user-a",
      },
      activeUserSessionId: "user-a",
      vaultUnlocked: true,
    });
    const account = first.snapshot.accounts.find((item) =>
      item.name.includes("12345678-0"),
    );
    assert.ok(account);
    assert.equal(accountBalance(account!, first.snapshot.transactions), 25.5);
    assert.equal(first.snapshot.investments.length, 1);
    assert.equal(first.snapshot.investments[0]?.amount, 1250);
    assert.equal(first.snapshot.investments[0]?.institutionId, "inst-picpay");
    assert.equal(first.result.addedExpenses, 0);
    assert.ok(
      (first.snapshot.investmentPositionHistory ?? []).some(
        (h) =>
          h.investmentId === first.snapshot.investments[0]?.id &&
          h.value === 1250,
      ),
    );

    const second = commitImport({
      draft,
      snapshot: first.snapshot,
      confirmation: {
        confirmed: true,
        checkboxChecked: true,
        selectedIds: [],
        userSessionId: "user-a",
      },
      activeUserSessionId: "user-a",
      vaultUnlocked: true,
    });
    assert.equal(second.snapshot.investments.length, 1);
    assert.equal(second.snapshot.investments[0]?.amount, 1250);
    assert.equal(
      second.snapshot.accounts.filter((item) => item.name.includes("PicPay"))
        .length,
      1,
    );
  });

  it("faz o saldo da conta bater com o extrato e registra aporte sem inventar posição", () => {
    const doc = analyzeFinancialDocument(
      NUBANK,
      "NU_12345678_01AGO2026_31AGO2026.pdf",
    );
    const snap = createEmptySnapshot();
    const draft = buildFinancialImportDraft({
      parsed: doc,
      ai: { transactions: [], usedAI: false },
      fileName: "nu.pdf",
      userSessionId: "user-a",
      snapshot: snap,
    });
    const committed = commitImport({
      draft,
      snapshot: snap,
      confirmation: {
        confirmed: true,
        checkboxChecked: true,
        selectedIds: draft.transactions.map((tx) => tx.id),
        userSessionId: "user-a",
      },
      activeUserSessionId: "user-a",
      vaultUnlocked: true,
    });
    const account = committed.snapshot.accounts.find((item) =>
      item.name.includes("1234567-8"),
    );
    assert.ok(account);
    assert.equal(
      accountBalance(account!, committed.snapshot.transactions),
      410,
    );
    assert.equal(committed.snapshot.investments.length, 1);
    // Movimentação ≠ posição: aporte cria entidade, saldo patrimonial fica 0 até informe.
    assert.equal(committed.snapshot.investments[0]?.amount, 0);
    assert.equal(
      committed.snapshot.transactions.filter((tx) => tx.kind === "investment_buy")
        .length,
      1,
    );
    assert.equal(committed.result.addedExpenses, 1);
    assert.equal(committed.result.addedIncomes, 1);

    const again = commitImport({
      draft,
      snapshot: committed.snapshot,
      confirmation: {
        confirmed: true,
        checkboxChecked: true,
        selectedIds: draft.transactions.map((tx) => tx.id),
        userSessionId: "user-a",
      },
      activeUserSessionId: "user-a",
      vaultUnlocked: true,
    });
    const same = again.snapshot.accounts.find((item) => item.id === account!.id);
    assert.equal(accountBalance(same!, again.snapshot.transactions), 410);
    assert.equal(again.snapshot.investments[0]?.amount, 0);
    assert.equal(
      again.snapshot.transactions.filter((tx) => tx.kind === "investment_buy")
        .length,
      1,
    );
  });

  it("atualiza conta já cadastrada e o desfazer restaura o saldo", () => {
    const doc = analyzeFinancialDocument(
      NUBANK,
      "NU_12345678_01AGO2026_31AGO2026.pdf",
    );
    let snap = createEmptySnapshot();
    const existing: Account = {
      id: "acc_nu",
      name: "Nubank antiga",
      type: "checking",
      openingBalance: 50,
      openingDate: "2026-01-01",
      currency: "BRL",
      status: "active",
      institutionId: "inst-nubank",
      notes: gfinAccountMarker("inst-nubank", "12345678"),
      createdAt: snap.updatedAt,
      updatedAt: snap.updatedAt,
    };
    snap = upsertEntity(snap, "accounts", existing);
    const draft = buildFinancialImportDraft({
      parsed: doc,
      ai: { transactions: [], usedAI: false },
      fileName: "nu.pdf",
      userSessionId: "user-a",
      snapshot: snap,
    });
    const committed = commitImport({
      draft,
      snapshot: snap,
      confirmation: {
        confirmed: true,
        checkboxChecked: true,
        selectedIds: draft.transactions.map((tx) => tx.id),
        userSessionId: "user-a",
      },
      activeUserSessionId: "user-a",
      vaultUnlocked: true,
    });
    assert.equal(
      committed.snapshot.accounts.filter((item) => item.institutionId === "inst-nubank")
        .length,
      1,
    );
    const updated = committed.snapshot.accounts.find((item) => item.id === "acc_nu");
    assert.equal(accountBalance(updated!, committed.snapshot.transactions), 410);

    const restored = rollbackImport(
      committed.snapshot,
      committed.rollback,
      "user-a",
    );
    const back = restored.accounts.find((item) => item.id === "acc_nu");
    assert.equal(back?.openingBalance, 50);
    assert.equal(accountBalance(back!, restored.transactions), 50);
    assert.equal(restored.investments.length, 0);
  });
});
