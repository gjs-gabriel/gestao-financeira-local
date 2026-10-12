import type {
  PluggyAccount,
  PluggyBill,
  PluggyFetchBundle,
  PluggyInvestment,
  PluggyLoan,
  PluggyTransaction,
} from "../../infra/pluggy/types";
import type { Account, CreditCard, CreditCardInvoice } from "../ledger-types";
import type {
  Debt,
  InstallmentExpense,
  Investment,
  InvestmentClass,
  OneTimeExpense,
  OneTimeIncome,
} from "../types";
import { sanitizeBankString } from "../../security/gfin-guard";
import { mapPluggyCategoryToId } from "./pluggy-category-map";

export interface MappedCardPurchase {
  id: string;
  creditCardId: string;
  invoiceId?: string;
  date: string;
  amount: number;
  description: string;
  categoryId?: string;
  importHash: string;
}

export interface MappedPluggyBundle {
  accounts: Account[];
  creditCards: CreditCard[];
  invoices: CreditCardInvoice[];
  cardPurchases: MappedCardPurchase[];
  oneTimeExpenses: OneTimeExpense[];
  oneTimeIncomes: OneTimeIncome[];
  installmentExpenses: InstallmentExpense[];
  investments: Investment[];
  debts: Debt[];
  /** Saldo Pluggy por account local id — para calibrar openingBalance. */
  targetBalances: Record<string, number>;
  idMaps: {
    accounts: Record<string, string>;
    creditCards: Record<string, string>;
    investments: Record<string, string>;
  };
}

function isoDate(value: string | null | undefined, fallback = "1970-01-01"): string {
  if (!value) return fallback;
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback;
}

function dayFromIso(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const day = Number(value.slice(8, 10));
  if (!Number.isFinite(day) || day < 1) return fallback;
  return Math.min(28, day);
}

function absMoney(n: number): number {
  return Math.round(Math.abs(n) * 100) / 100;
}

function bankLabel(raw: string | null | undefined, fallback: string): string {
  const clean = sanitizeBankString(raw ?? "", 500);
  return clean || fallback;
}

function normalizeDesc(raw: string): string {
  return sanitizeBankString(raw, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function installmentMeta(tx: PluggyTransaction): {
  number: number | null;
  total: number | null;
  billId: string | null;
} {
  const meta = tx.creditCardMetadata;
  const number = meta?.installmentNumber ?? tx.installmentNumber ?? null;
  const total = meta?.totalInstallments ?? tx.totalInstallments ?? null;
  const billId = meta?.billId ?? tx.billId ?? null;
  return {
    number: typeof number === "number" ? number : null,
    total: typeof total === "number" ? total : null,
    billId: typeof billId === "string" ? billId : null,
  };
}

function isDebit(tx: PluggyTransaction): boolean {
  if (tx.type === "DEBIT") return true;
  if (tx.type === "CREDIT") return false;
  return tx.amount < 0;
}

function mapAccountType(subtype: string): Account["type"] {
  if (subtype === "SAVINGS_ACCOUNT") return "savings";
  if (subtype === "CHECKING_ACCOUNT") return "checking";
  return "other";
}

function mapInvestmentClass(type?: string | null, subtype?: string | null): InvestmentClass {
  const blob = `${type ?? ""} ${subtype ?? ""}`.toLowerCase();
  if (blob.includes("equity") || blob.includes("stock") || blob.includes("acao")) {
    return "acoes";
  }
  if (blob.includes("fii") || blob.includes("real estate")) return "fiis";
  if (blob.includes("etf")) return "etfs";
  if (blob.includes("crypto") || blob.includes("cripto")) return "cripto";
  if (blob.includes("pension") || blob.includes("previd")) return "previdencia";
  if (blob.includes("saving") || blob.includes("poup")) return "poupanca";
  if (
    blob.includes("fixed") ||
    blob.includes("cdb") ||
    blob.includes("lci") ||
    blob.includes("lca") ||
    blob.includes("tesouro") ||
    blob.includes("renda_fixa") ||
    blob.includes("fixed_income")
  ) {
    return "renda_fixa";
  }
  return "outro";
}

function mapBankAccount(acc: PluggyAccount, now: string): Account {
  return {
    id: `pluggy_acc_${acc.id}`,
    name: bankLabel(acc.marketingName || acc.name, "Conta Pluggy"),
    type: mapAccountType(String(acc.subtype)),
    openingBalance: absMoney(acc.balance),
    openingDate: now.slice(0, 10),
    currency: "BRL",
    status: "active",
    notes: `pluggy:${acc.id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function mapCreditCard(acc: PluggyAccount, now: string): CreditCard {
  const due = dayFromIso(acc.creditData?.balanceDueDate, 10);
  const close = dayFromIso(acc.creditData?.balanceCloseDate, 1);
  return {
    id: `pluggy_card_${acc.id}`,
    name: bankLabel(acc.marketingName || acc.name, "Cartão Pluggy"),
    limit: absMoney(acc.creditData?.creditLimit ?? 0),
    closingDay: close,
    dueDay: due,
    status:
      acc.creditData?.status === "CANCELLED" || acc.creditData?.status === "BLOCKED"
        ? "archived"
        : "active",
    notes: `pluggy:${acc.id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function billStatus(bill: PluggyBill): CreditCardInvoice["status"] {
  const paid = (bill.payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
  if (paid + 0.009 >= bill.totalAmount && bill.totalAmount > 0) return "paid";
  const due = new Date(isoDate(bill.dueDate));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due.getTime() < today.getTime() && paid < bill.totalAmount) return "closed";
  return "open";
}

function mapBill(
  bill: PluggyBill,
  creditCardId: string,
  now: string,
): CreditCardInvoice {
  const due = isoDate(bill.dueDate, now.slice(0, 10));
  const periodKey = due.slice(0, 7);
  return {
    id: `pluggy_bill_${bill.id}`,
    creditCardId,
    periodKey,
    closingDate: due,
    dueDate: due,
    status: billStatus(bill),
    paidAmount:
      billStatus(bill) === "paid"
        ? absMoney(
            (bill.payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0),
          )
        : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function mapInvestment(inv: PluggyInvestment, now: string): Investment {
  const amount = absMoney(inv.balance ?? inv.amount ?? inv.value ?? 0);
  return {
    id: `pluggy_inv_${inv.id}`,
    name: bankLabel(inv.name, "Investimento Pluggy"),
    amount,
    classification: mapInvestmentClass(inv.type, inv.subtype),
    externalId: inv.id,
    isin: inv.isin ?? undefined,
    ticker: inv.code ?? undefined,
    lifecycle: inv.status === "TOTAL_WITHDRAWAL" ? "closed" : "active",
    notes: `pluggy:${inv.id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function mapLoan(loan: PluggyLoan, now: string): Debt {
  const balance = absMoney(loan.outstandingBalance ?? loan.balance ?? 0);
  return {
    id: `pluggy_loan_${loan.id}`,
    name: bankLabel(
      loan.productName || loan.contractNumber,
      `Empréstimo ${loan.id.slice(0, 8)}`,
    ),
    balance,
    installmentAmount:
      loan.installmentAmount != null ? absMoney(loan.installmentAmount) : undefined,
    interestRate: loan.interestRate ?? undefined,
    dueDate: loan.installmentDueDate
      ? isoDate(loan.installmentDueDate)
      : undefined,
    notes: `pluggy:${loan.id}`,
    createdAt: now,
    updatedAt: now,
  };
}

interface InstallmentGroup {
  key: string;
  name: string;
  installmentAmount: number;
  totalInstallments: number;
  startDate: string;
  categoryId?: string;
  samples: PluggyTransaction[];
}

function groupInstallments(txs: PluggyTransaction[]): {
  groups: InstallmentGroup[];
  installmentTxIds: Set<string>;
} {
  const buckets = new Map<string, PluggyTransaction[]>();
  const installmentTxIds = new Set<string>();

  for (const tx of txs) {
    const meta = installmentMeta(tx);
    if (!meta.total || meta.total < 2) continue;
    installmentTxIds.add(tx.id);
    const key = `${normalizeDesc(tx.description)}|${meta.total}|${absMoney(tx.amount)}`;
    const list = buckets.get(key) ?? [];
    list.push(tx);
    buckets.set(key, list);
  }

  const groups: InstallmentGroup[] = [];
  for (const [, samples] of buckets) {
    samples.sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    const first = samples[0]!;
    const meta = installmentMeta(first);
    const total = meta.total ?? samples.length;
    const withNumber = samples
      .map((s) => ({ s, n: installmentMeta(s).number }))
      .filter((x) => x.n != null) as { s: PluggyTransaction; n: number }[];
    let startDate = isoDate(first.date);
    if (withNumber.length > 0) {
      withNumber.sort((a, b) => a.n - b.n);
      const earliest = withNumber[0]!;
      if (earliest.n === 1) {
        startDate = isoDate(earliest.s.date);
      } else {
        const d = new Date(`${isoDate(earliest.s.date)}T12:00:00`);
        d.setMonth(d.getMonth() - (earliest.n - 1));
        startDate = d.toISOString().slice(0, 10);
      }
    }
    groups.push({
      key: `pluggy_plan_${normalizeDesc(first.description).slice(0, 40)}_${total}_${absMoney(first.amount)}`,
      name: bankLabel(first.description, "Compra parcelada"),
      installmentAmount: absMoney(first.amount),
      totalInstallments: total,
      startDate,
      categoryId: mapPluggyCategoryToId(first.category ?? undefined),
      samples,
    });
  }

  return { groups, installmentTxIds };
}

function stablePlanId(group: InstallmentGroup): string {
  const slug = group.key.replace(/[^a-z0-9_]+/g, "_").slice(0, 80);
  return `pluggy_inst_${slug}`;
}

/**
 * Transforma o bundle da Pluggy em entidades do domínio (puro, sem I/O).
 */
export function mapPluggyBundle(
  bundle: PluggyFetchBundle,
  now = new Date().toISOString(),
): MappedPluggyBundle {
  const accounts: Account[] = [];
  const creditCards: CreditCard[] = [];
  const invoices: CreditCardInvoice[] = [];
  const cardPurchases: MappedCardPurchase[] = [];
  const oneTimeExpenses: OneTimeExpense[] = [];
  const oneTimeIncomes: OneTimeIncome[] = [];
  const installmentExpenses: InstallmentExpense[] = [];
  const investments: Investment[] = [];
  const debts: Debt[] = [];
  const targetBalances: Record<string, number> = {};
  const idMaps = {
    accounts: {} as Record<string, string>,
    creditCards: {} as Record<string, string>,
    investments: {} as Record<string, string>,
  };

  const creditAccountToCard = new Map<string, string>();
  const allTxs: PluggyTransaction[] = [];

  for (const item of bundle.items) {
    for (const acc of item.accounts) {
      if (acc.type === "BANK") {
        const mapped = mapBankAccount(acc, now);
        accounts.push(mapped);
        idMaps.accounts[acc.id] = mapped.id;
        targetBalances[mapped.id] = acc.balance;
      } else if (acc.type === "CREDIT") {
        const card = mapCreditCard(acc, now);
        creditCards.push(card);
        idMaps.creditCards[acc.id] = card.id;
        creditAccountToCard.set(acc.id, card.id);
        // Passivo: saldo aberto do cartão como dívida auxiliar se não houver bills.
        if (acc.balance > 0 && item.bills.length === 0) {
          debts.push({
            id: `pluggy_ccbal_${acc.id}`,
            name: `Fatura aberta — ${card.name}`,
            balance: absMoney(acc.balance),
            notes: `pluggy-credit-balance:${acc.id}`,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    for (const bill of item.bills) {
      const accountId = bill.accountId;
      const cardId =
        (accountId && creditAccountToCard.get(accountId)) ||
        creditCards[0]?.id;
      if (!cardId) continue;
      const inv = mapBill(bill, cardId, now);
      invoices.push(inv);
      if (inv.status !== "paid" && bill.totalAmount > 0) {
        cardPurchases.push({
          id: `pluggy_bill_bal_${bill.id}`,
          creditCardId: cardId,
          invoiceId: inv.id,
          date: inv.dueDate,
          amount: absMoney(bill.totalAmount),
          description: `Fatura ${inv.periodKey}`,
          categoryId: "cat-outros",
          importHash: `pluggy:bill:${bill.id}`,
        });
      }
    }

    for (const inv of item.investments) {
      const mapped = mapInvestment(inv, now);
      investments.push(mapped);
      idMaps.investments[inv.id] = mapped.id;
    }

    for (const loan of item.loans) {
      debts.push(mapLoan(loan, now));
    }

    allTxs.push(...item.transactions);
  }

  const { groups, installmentTxIds } = groupInstallments(allTxs);
  for (const group of groups) {
    installmentExpenses.push({
      id: stablePlanId(group),
      name: group.name,
      installmentAmount: group.installmentAmount,
      totalInstallments: group.totalInstallments,
      startDate: group.startDate,
      categoryId: group.categoryId,
      notes: "pluggy-installment",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Passivo de fatura = card_purchase sintético por bill.
  // Extrato (bank + credit) alimenta oneTime* para Fluxo/Relatórios — sem
  // religar txs individuais à invoice (evita dobrar invoiceAmount).
  for (const tx of allTxs) {
    if (installmentTxIds.has(tx.id)) continue;
    const date = isoDate(tx.date, now.slice(0, 10));
    const amount = absMoney(tx.amount);
    if (amount <= 0) continue;
    const categoryId = mapPluggyCategoryToId(tx.category ?? undefined);
    const name = bankLabel(tx.description, "Lançamento Pluggy");
    const debit = isDebit(tx);

    if (debit) {
      oneTimeExpenses.push({
        id: `pluggy_tx_${tx.id}`,
        name,
        amount,
        date,
        categoryId,
        notes: "pluggy",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      oneTimeIncomes.push({
        id: `pluggy_tx_${tx.id}`,
        name,
        amount,
        date,
        categoryId: categoryId ?? "cat-renda-extra",
        notes: "pluggy",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    accounts,
    creditCards,
    invoices,
    cardPurchases,
    oneTimeExpenses,
    oneTimeIncomes,
    installmentExpenses,
    investments,
    debts,
    targetBalances,
    idMaps,
  };
}
