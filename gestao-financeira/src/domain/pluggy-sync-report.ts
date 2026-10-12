import type { PluggyFetchBundle } from "@/infra/pluggy/types";
import type { MappedPluggyBundle } from "./mappers/pluggy-mapper";

export type PluggyLogLevel = "ok" | "info" | "warn" | "error";

export interface PluggyLogLine {
  level: PluggyLogLevel;
  text: string;
}

export interface PluggySyncReport {
  fetchedAt: string;
  itemIds: string[];
  /** Contagens vindas da API Pluggy. */
  fetched: {
    items: number;
    bankAccounts: number;
    creditAccounts: number;
    transactions: number;
    investments: number;
    bills: number;
    loans: number;
  };
  /** Contagens gravadas no VaultSnapshot após o mapper. */
  applied: {
    accounts: number;
    creditCards: number;
    invoices: number;
    expenses: number;
    incomes: number;
    installments: number;
    investments: number;
    debts: number;
    cardPurchases: number;
  };
  lines: PluggyLogLine[];
}

function countByType(
  accounts: { type: string }[],
  type: string,
): number {
  return accounts.filter((a) => a.type === type).length;
}

/** Monta relatório legível do que veio da Pluggy e do que entrou no cofre. */
export function buildPluggySyncReport(
  bundle: PluggyFetchBundle,
  mapped: MappedPluggyBundle,
  itemIds: string[],
): PluggySyncReport {
  const allAccounts = bundle.items.flatMap((i) => i.accounts);
  const fetched = {
    items: bundle.items.length,
    bankAccounts: countByType(allAccounts, "BANK"),
    creditAccounts: countByType(allAccounts, "CREDIT"),
    transactions: bundle.items.reduce((n, i) => n + i.transactions.length, 0),
    investments: bundle.items.reduce((n, i) => n + i.investments.length, 0),
    bills: bundle.items.reduce((n, i) => n + i.bills.length, 0),
    loans: bundle.items.reduce((n, i) => n + i.loans.length, 0),
  };

  const applied = {
    accounts: mapped.accounts.length,
    creditCards: mapped.creditCards.length,
    invoices: mapped.invoices.length,
    expenses: mapped.oneTimeExpenses.length,
    incomes: mapped.oneTimeIncomes.length,
    installments: mapped.installmentExpenses.length,
    investments: mapped.investments.length,
    debts: mapped.debts.length,
    cardPurchases: mapped.cardPurchases.length,
  };

  const lines: PluggyLogLine[] = [];
  const when = new Date(bundle.fetchedAt).toLocaleString("pt-BR");
  lines.push({
    level: "ok",
    text: `Sincronização concluída em ${when}.`,
  });
  lines.push({
    level: "info",
    text: `Itens: ${itemIds.length} · ${itemIds.join(", ") || "—"}`,
  });

  // Sucessos (o que trouxe)
  if (fetched.bankAccounts > 0) {
    lines.push({
      level: "ok",
      text: `Trouxe ${fetched.bankAccounts} conta(s) bancária(s) → ${applied.accounts} no cofre.`,
    });
  } else {
    lines.push({
      level: "warn",
      text: "Não trouxe contas bancárias (BANK).",
    });
  }

  if (fetched.creditAccounts > 0) {
    lines.push({
      level: "ok",
      text: `Trouxe ${fetched.creditAccounts} cartão(ões) → ${applied.creditCards} cartão(ões), ${applied.invoices} fatura(s).`,
    });
  } else {
    lines.push({
      level: "info",
      text: "Não trouxe contas de crédito (CREDIT).",
    });
  }

  if (fetched.transactions > 0) {
    lines.push({
      level: "ok",
      text: `Trouxe ${fetched.transactions} lançamento(s) → ${applied.expenses} despesa(s) + ${applied.incomes} receita(s) pontual(is).`,
    });
  } else {
    lines.push({
      level: "warn",
      text: "Não trouxe extrato (transactions = 0).",
    });
  }

  if (applied.installments > 0) {
    lines.push({
      level: "ok",
      text: `Identificou ${applied.installments} plano(s) de parcelas.`,
    });
  } else {
    lines.push({
      level: "info",
      text: "Não identificou compras parceladas no extrato.",
    });
  }

  if (fetched.investments > 0) {
    lines.push({
      level: "ok",
      text: `Trouxe ${fetched.investments} investimento(s) → ${applied.investments} no cofre.`,
    });
  } else {
    lines.push({
      level: "info",
      text: "Não trouxe investimentos.",
    });
  }

  if (fetched.bills > 0) {
    lines.push({
      level: "ok",
      text: `Trouxe ${fetched.bills} fatura(s) de cartão → ${applied.invoices} invoice(s) / ${applied.cardPurchases} lançamento(s) de fatura.`,
    });
  } else if (fetched.creditAccounts > 0) {
    lines.push({
      level: "warn",
      text: "Há cartão, mas nenhuma fatura (bills) veio da Pluggy.",
    });
  }

  if (fetched.loans > 0 || applied.debts > 0) {
    lines.push({
      level: "ok",
      text: `Trouxe ${fetched.loans} empréstimo(s) → ${applied.debts} dívida(s) no cofre.`,
    });
  } else {
    lines.push({
      level: "info",
      text: "Não trouxe empréstimos (loans).",
    });
  }

  for (const w of bundle.warnings ?? []) {
    lines.push({
      level: w.level === "warn" ? "warn" : "info",
      text: w.itemId ? `[${w.itemId.slice(0, 8)}…] ${w.message}` : w.message,
    });
  }

  return {
    fetchedAt: bundle.fetchedAt,
    itemIds,
    fetched,
    applied,
    lines,
  };
}

export function pluggyErrorReport(message: string): PluggySyncReport {
  return {
    fetchedAt: new Date().toISOString(),
    itemIds: [],
    fetched: {
      items: 0,
      bankAccounts: 0,
      creditAccounts: 0,
      transactions: 0,
      investments: 0,
      bills: 0,
      loans: 0,
    },
    applied: {
      accounts: 0,
      creditCards: 0,
      invoices: 0,
      expenses: 0,
      incomes: 0,
      installments: 0,
      investments: 0,
      debts: 0,
      cardPurchases: 0,
    },
    lines: [{ level: "error", text: message }],
  };
}
