import { createId } from "./snapshot";
import { invoiceAmount, cardOpenBalance } from "./ledger";
import { shiftMonth } from "./insights";
import { monthKey } from "./cashflow";
import type {
  CreditCard,
  CreditCardInvoice,
  Transaction,
} from "./ledger-types";
import type { VaultSnapshot } from "./types";
import { upsertEntity, touchSnapshot } from "./snapshot";

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function clampDay(year: number, month: number, day: number) {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}

export function invoicePeriodForDate(
  card: CreditCard,
  date: string,
): { periodKey: string; closingDate: string; dueDate: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const closingDay = clampDay(year, month, card.closingDay);

  let closeYear = year;
  let closeMonth = month;
  // Compra após o fechamento cai na fatura do mês seguinte
  if (day > closingDay) {
    const next = shiftMonth(year, month, 1);
    closeYear = next.year;
    closeMonth = next.month;
  }

  const closingDate = `${monthKey(closeYear, closeMonth)}-${String(clampDay(closeYear, closeMonth, card.closingDay)).padStart(2, "0")}`;
  let dueYear = closeYear;
  let dueMonth = closeMonth;
  // Vencimento tipicamente no mês seguinte ao fechamento
  const due = shiftMonth(closeYear, closeMonth, 1);
  dueYear = due.year;
  dueMonth = due.month;
  const dueDate = `${monthKey(dueYear, dueMonth)}-${String(clampDay(dueYear, dueMonth, card.dueDay)).padStart(2, "0")}`;

  return {
    periodKey: monthKey(closeYear, closeMonth),
    closingDate,
    dueDate,
  };
}

export function findOrCreateInvoice(
  snapshot: VaultSnapshot,
  card: CreditCard,
  date: string,
  now = new Date().toISOString(),
): { snapshot: VaultSnapshot; invoice: CreditCardInvoice } {
  const period = invoicePeriodForDate(card, date);
  const existing = (snapshot.invoices ?? []).find(
    (inv) =>
      inv.creditCardId === card.id &&
      inv.periodKey === period.periodKey &&
      inv.status !== "paid",
  );
  if (existing) return { snapshot, invoice: existing };

  const invoice: CreditCardInvoice = {
    id: createId("inv"),
    creditCardId: card.id,
    periodKey: period.periodKey,
    closingDate: period.closingDate,
    dueDate: period.dueDate,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  return {
    snapshot: upsertEntity(snapshot, "invoices", invoice),
    invoice,
  };
}

export function recordCardPurchase(
  snapshot: VaultSnapshot,
  input: {
    cardId: string;
    amount: number;
    date: string;
    description: string;
    categoryId?: string;
    notes?: string;
  },
): VaultSnapshot {
  const card = (snapshot.creditCards ?? []).find((c) => c.id === input.cardId);
  if (!card) throw new Error("Cartão não encontrado");
  if (input.amount <= 0) throw new Error("Valor inválido");

  const now = new Date().toISOString();
  const { snapshot: withInvoice, invoice } = findOrCreateInvoice(
    snapshot,
    card,
    input.date,
    now,
  );

  const tx: Transaction = {
    id: createId("tx"),
    kind: "card_purchase",
    date: input.date,
    amount: input.amount,
    description: input.description,
    categoryId: input.categoryId,
    creditCardId: card.id,
    invoiceId: invoice.id,
    institutionId: card.institutionId,
    institutionOther: card.institutionOther,
    status: "confirmed",
    source: "manual",
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };

  return upsertEntity(withInvoice, "transactions", tx);
}

export function payInvoice(
  snapshot: VaultSnapshot,
  invoiceId: string,
  opts?: { accountId?: string; date?: string; amount?: number },
): VaultSnapshot {
  const invoice = (snapshot.invoices ?? []).find((i) => i.id === invoiceId);
  if (!invoice) throw new Error("Fatura não encontrada");
  if (invoice.status === "paid") throw new Error("Fatura já paga");

  const card = (snapshot.creditCards ?? []).find(
    (c) => c.id === invoice.creditCardId,
  );
  const amount = opts?.amount ?? invoiceAmount(invoice, snapshot.transactions ?? []);
  if (amount <= 0) {
    return upsertEntity(snapshot, "invoices", {
      ...invoice,
      status: "paid",
      paidAmount: 0,
      paidAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const accountId =
    opts?.accountId ?? card?.paymentAccountId ?? snapshot.accounts?.[0]?.id;
  if (!accountId) throw new Error("Informe a conta de pagamento");

  const now = new Date().toISOString();
  const payDate = opts?.date ?? invoice.dueDate;
  const payment: Transaction = {
    id: createId("tx"),
    kind: "invoice_payment",
    date: payDate,
    amount,
    description: `Pagamento fatura ${card?.name ?? "cartão"} (${invoice.periodKey})`,
    accountId,
    creditCardId: invoice.creditCardId,
    invoiceId: invoice.id,
    status: "confirmed",
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };

  let next = upsertEntity(snapshot, "transactions", payment);
  next = upsertEntity(next, "invoices", {
    ...invoice,
    status: "paid",
    paidAmount: amount,
    paidAt: now,
    paymentTransactionId: payment.id,
    updatedAt: now,
  });
  return touchSnapshot(next, {});
}

export function cardLimitUsage(
  card: CreditCard,
  snapshot: VaultSnapshot,
): { used: number; available: number; limit: number } {
  const used = cardOpenBalance(
    card,
    snapshot.invoices ?? [],
    snapshot.transactions ?? [],
  );
  return {
    used,
    available: Math.max(0, card.limit - used),
    limit: card.limit,
  };
}

export function openInvoicesForCard(
  snapshot: VaultSnapshot,
  cardId: string,
): CreditCardInvoice[] {
  return (snapshot.invoices ?? [])
    .filter((i) => i.creditCardId === cardId && i.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
