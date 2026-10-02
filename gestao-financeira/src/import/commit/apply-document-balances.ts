import { accountBalance } from "@/domain/ledger";
import type { Account, Transaction } from "@/domain/ledger-types";
import { createId, upsertEntity } from "@/domain/snapshot";
import { createAccountDraft, upsertInvestmentSynced } from "@/domain/sync";
import type { Investment, InvestmentClass, VaultSnapshot } from "@/domain/types";
import { classifyProduct } from "../parsers/br-document";
import type {
  ImportAccountSnapshot,
  ImportHoldingSnapshot,
} from "../types";

export interface InvestmentMovementRow {
  date: string;
  amount: number;
  signedAmount: number;
  description: string;
  holdingName?: string | null;
  institutionId?: string;
  institutionOther?: string;
  duplicate: boolean;
  include: boolean;
}

export interface ApplyBalancesResult {
  snapshot: VaultSnapshot;
  primaryAccountId?: string;
  createdAccountIds: string[];
  createdInvestmentIds: string[];
  createdTransactionIds: string[];
  previousAccounts: Account[];
  previousInvestments: Investment[];
  addedAccounts: number;
  updatedAccounts: number;
  addedInvestments: number;
  updatedInvestments: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function gfinAccountMarker(institutionId: string, digits: string): string {
  return `[gfin:${institutionId}:${digits}]`;
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  return short.length >= 8 && long.includes(short);
}

function findAccount(
  snapshot: VaultSnapshot,
  wanted: ImportAccountSnapshot,
): Account | undefined {
  const digits = wanted.accountDigits;
  const marker = digits ? gfinAccountMarker(wanted.institutionId, digits) : null;
  return (snapshot.accounts ?? []).find((account) => {
    if (marker && account.notes?.includes(marker)) return true;
    if (!digits || digits.length < 5) return false;
    if (account.institutionId && account.institutionId !== wanted.institutionId) {
      return false;
    }
    const hay = `${account.name} ${account.notes ?? ""}`.replace(/\D/g, "");
    return hay.includes(digits) || (digits.length > 5 && hay.includes(digits.slice(0, -1)));
  });
}

function withMarker(notes: string | undefined, marker: string | null): string | undefined {
  if (!marker) return notes;
  if (notes?.includes(marker)) return notes;
  const base = (notes ?? "").replace(/\[gfin:[^\]]+\]/g, "").trim();
  return [base, marker].filter(Boolean).join(" ");
}

function rememberAccount(list: Account[], account: Account): void {
  if (!list.some((item) => item.id === account.id)) list.push({ ...account });
}

function rememberInvestment(list: Investment[], item: Investment): void {
  if (!list.some((current) => current.id === item.id)) list.push({ ...item });
}

function findInvestment(
  snapshot: VaultSnapshot,
  institutionId: string | undefined,
  name: string,
): Investment | undefined {
  return snapshot.investments.find(
    (item) =>
      (!institutionId ||
        !item.institutionId ||
        item.institutionId === institutionId) &&
      namesMatch(item.name, name),
  );
}

/**
 * Cria ou reencontra as contas do documento e define o saldo inicial
 * provisório. O acerto final acontece depois dos lançamentos.
 */
export function ensureImportedAccounts(
  snapshot: VaultSnapshot,
  accounts: ImportAccountSnapshot[],
): ApplyBalancesResult {
  const result: ApplyBalancesResult = {
    snapshot,
    createdAccountIds: [],
    createdInvestmentIds: [],
    createdTransactionIds: [],
    previousAccounts: [],
    previousInvestments: [],
    addedAccounts: 0,
    updatedAccounts: 0,
    addedInvestments: 0,
    updatedInvestments: 0,
  };
  let next = snapshot;
  const now = new Date().toISOString();

  for (const wanted of accounts) {
    if (!wanted.include) continue;
    const marker = wanted.accountDigits
      ? gfinAccountMarker(wanted.institutionId, wanted.accountDigits)
      : null;
    const existing = findAccount(next, wanted);
    const provisional =
      wanted.balanceMode === "statement"
        ? (wanted.openingBalance ?? wanted.closingBalance)
        : wanted.closingBalance;

    if (!existing) {
      const created = createAccountDraft({
        name: wanted.label.slice(0, 80),
        type: wanted.accountType,
        openingBalance: provisional,
        openingDate: wanted.periodStart ?? wanted.asOf,
        institutionId: wanted.institutionId,
        institutionOther:
          wanted.institutionId === "inst-outro"
            ? wanted.institutionName
            : undefined,
        notes: withMarker(
          [
            wanted.agency ? `Agência ${wanted.agency}` : "",
            wanted.accountNumber ? `Conta ${wanted.accountNumber}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          marker,
        ),
      });
      next = upsertEntity(next, "accounts", created);
      result.createdAccountIds.push(created.id);
      result.addedAccounts += 1;
      if (!result.primaryAccountId) result.primaryAccountId = created.id;
      continue;
    }

    rememberAccount(result.previousAccounts, existing);
    const patched: Account = {
      ...existing,
      institutionId: existing.institutionId ?? wanted.institutionId,
      notes: withMarker(existing.notes, marker),
      updatedAt: now,
    };
    next = upsertEntity(next, "accounts", patched);
    result.updatedAccounts += 1;
    if (!result.primaryAccountId) result.primaryAccountId = existing.id;
  }

  result.snapshot = next;
  return result;
}

function applyPosition(
  snapshot: VaultSnapshot,
  input: {
    name: string;
    institutionId?: string;
    institutionOther?: string;
    classification: InvestmentClass;
    /** Valor absoluto final, ou null para somar delta. */
    absolute: number | null;
    delta: number;
    notes?: string;
  },
  result: ApplyBalancesResult,
): VaultSnapshot {
  const now = new Date().toISOString();
  const existing = findInvestment(snapshot, input.institutionId, input.name);
  if (existing) {
    rememberInvestment(result.previousInvestments, existing);
    const amount =
      input.absolute != null
        ? input.absolute
        : round2(Math.max(0, existing.amount + input.delta));
    if (Math.abs(amount - existing.amount) < 0.005 && !input.notes) {
      return snapshot;
    }
    const notes = input.notes
      ? existing.notes?.includes(input.notes)
        ? existing.notes
        : [existing.notes, input.notes].filter(Boolean).join(" · ")
      : existing.notes;
    result.updatedInvestments += 1;
    return upsertInvestmentSynced(snapshot, {
      ...existing,
      amount,
      classification: input.classification || existing.classification,
      institutionId: existing.institutionId ?? input.institutionId,
      notes,
      updatedAt: now,
    });
  }

  const amount =
    input.absolute != null ? input.absolute : Math.max(0, input.delta);
  if (amount <= 0 && input.absolute == null) return snapshot;
  const created: Investment = {
    id: createId("inv"),
    name: input.name.slice(0, 120),
    amount,
    classification: input.classification,
    institutionId: input.institutionId,
    institutionOther: input.institutionOther,
    notes: input.notes ?? "Importado do documento",
    createdAt: now,
    updatedAt: now,
  };
  result.createdInvestmentIds.push(created.id);
  result.addedInvestments += 1;
  return upsertInvestmentSynced(snapshot, created);
}

export function applyInvestmentMovements(
  snapshot: VaultSnapshot,
  rows: InvestmentMovementRow[],
  accountId: string | undefined,
  result: ApplyBalancesResult,
): VaultSnapshot {
  let next = snapshot;
  const now = new Date().toISOString();
  const resolvedAccount = accountId;

  for (const row of rows) {
    if (!row.include || row.duplicate || row.amount <= 0 || !row.date) continue;
    const name = (row.holdingName || row.description).slice(0, 120);
    const buy = row.signedAmount < 0;
    const duplicate = (next.transactions ?? []).some(
      (tx) =>
        (tx.kind === "investment_buy" || tx.kind === "investment_sell") &&
        tx.date === row.date &&
        Math.abs(tx.amount - row.amount) < 0.005 &&
        tx.description.trim().toLowerCase() === row.description.trim().toLowerCase() &&
        tx.status !== "ignored",
    );
    if (duplicate) continue;

    // Regra de ouro: movimentação ≠ posição.
    // Apenas registra a operação; NÃO altera o patrimônio do investimento
    // sem evidência explícita de saldo/posição no documento.
    const existing = findInvestment(next, row.institutionId, name);
    const tx: Transaction = {
      id: createId("tx"),
      kind: buy ? "investment_buy" : "investment_sell",
      date: row.date,
      amount: row.amount,
      description: row.description.slice(0, 200),
      accountId: resolvedAccount,
      investmentId: existing?.id,
      institutionId: row.institutionId,
      institutionOther: row.institutionOther,
      status: "confirmed",
      source: "import",
      notes: "Importado do extrato (movimentação — posição não inferida)",
      createdAt: now,
      updatedAt: now,
    };
    next = upsertEntity(next, "transactions", tx);
    result.createdTransactionIds.push(tx.id);

    // Se o investimento ainda não existe, cria entidade com valor 0
    // (posição desconhecida) — não usa o valor do aporte como saldo.
    if (!existing) {
      next = applyPosition(
        next,
        {
          name,
          institutionId: row.institutionId,
          institutionOther: row.institutionOther,
          classification: classifyProduct(name),
          absolute: 0,
          delta: 0,
          notes: "Criado por movimentação — saldo patrimonial pendente de informe",
        },
        result,
      );
    }
  }

  return next;
}

export function applyHoldingSnapshots(
  snapshot: VaultSnapshot,
  holdings: ImportHoldingSnapshot[],
  result: ApplyBalancesResult,
  documentId?: string,
): VaultSnapshot {
  let next = snapshot;
  const now = new Date().toISOString();
  for (const holding of holdings) {
    if (!holding.include || holding.mode !== "snapshot") continue;
    const notes = [
      `Saldo informado em ${holding.asOf}`,
      holding.notes,
    ]
      .filter(Boolean)
      .join(" · ");
    next = applyPosition(
      next,
      {
        name: holding.name,
        institutionId: holding.institutionId,
        institutionOther:
          holding.institutionId === "inst-outro"
            ? holding.institutionName
            : undefined,
        classification: holding.classification,
        absolute: holding.amount,
        delta: 0,
        notes,
      },
      result,
    );

    const inv = findInvestment(next, holding.institutionId, holding.name);
    if (!inv) continue;

    const history = next.investmentPositionHistory ?? [];
    const existingPos = history.find(
      (h) => h.investmentId === inv.id && h.date === holding.asOf,
    );
    if (existingPos) {
      if (Math.abs(existingPos.value - holding.amount) < 0.005) continue;
      // Conflito: não sobrescrever silenciosamente — commit só chega aqui
      // se o usuário escolheu "usar importado" (include=true na revisão).
      next = {
        ...next,
        investmentPositionHistory: history.map((h) =>
          h.id === existingPos.id
            ? {
                ...h,
                value: holding.amount,
                sourceDocumentId: documentId ?? h.sourceDocumentId,
                updatedAt: now,
              }
            : h,
        ),
      };
    } else {
      next = {
        ...next,
        investmentPositionHistory: [
          ...history,
          {
            id: createId("ipos"),
            investmentId: inv.id,
            date: holding.asOf,
            value: holding.amount,
            sourceDocumentId: documentId,
            evidenceText: holding.name.slice(0, 200),
            extractionMethod: "DOCUMENT_PARSER",
            confidence: 0.9,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    }
  }
  return next;
}

/**
 * Faz o saldo calculado (saldo inicial + lançamentos) bater com o saldo do documento,
 * ajustando o saldo inicial — sem criar uma receita ou despesa fictícia.
 */
export function reconcileImportedAccounts(
  snapshot: VaultSnapshot,
  accounts: ImportAccountSnapshot[],
  primaryIds: Map<string, string>,
  result: ApplyBalancesResult,
): VaultSnapshot {
  let next = snapshot;
  const now = new Date().toISOString();
  for (const wanted of accounts) {
    if (!wanted.include) continue;
    const accountId = primaryIds.get(wanted.id);
    const account = (next.accounts ?? []).find((item) => item.id === accountId);
    if (!account) continue;
    const computed = accountBalance(account, next.transactions ?? []);
    const delta = round2(wanted.closingBalance - computed);
    if (Math.abs(delta) < 0.01) continue;
    if (!result.createdAccountIds.includes(account.id)) {
      rememberAccount(result.previousAccounts, account);
    }
    next = upsertEntity(next, "accounts", {
      ...account,
      openingBalance: round2(account.openingBalance + delta),
      updatedAt: now,
    });
  }
  return next;
}

export function accountIdMap(
  before: VaultSnapshot,
  after: VaultSnapshot,
  wanted: ImportAccountSnapshot[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of wanted) {
    if (!item.include) continue;
    const match = findAccount(after, item) ?? findAccount(before, item);
    if (match) map.set(item.id, match.id);
  }
  return map;
}
