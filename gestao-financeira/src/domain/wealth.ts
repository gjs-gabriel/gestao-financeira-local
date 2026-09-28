import {
  netWorthLedger,
  totalAccountBalances,
  totalInvestmentPositions,
  totalOpenInvoiceBalances,
  sumDebtBalances,
} from "./ledger";
import type { VaultSnapshot } from "./types";
import type { WealthSnapshot } from "./v15-types";
import { touchSnapshot } from "./snapshot";

export interface WealthBreakdown {
  accounts: number;
  investments: number;
  assets: number;
  invoices: number;
  debts: number;
  liabilities: number;
  netWorth: number;
}

export function wealthBreakdown(snapshot: VaultSnapshot): WealthBreakdown {
  const accounts = totalAccountBalances(
    snapshot.accounts ?? [],
    snapshot.transactions ?? [],
  );
  const investments =
    (snapshot.investmentPositions ?? []).length > 0
      ? totalInvestmentPositions(snapshot.investmentPositions ?? [])
      : snapshot.investments.reduce((s, i) => s + i.amount, 0);
  const invoices = totalOpenInvoiceBalances(
    snapshot.invoices ?? [],
    snapshot.transactions ?? [],
  );
  const debts = sumDebtBalances(snapshot.debts);
  const assets = accounts + investments;
  const liabilities = invoices + debts;
  return {
    accounts,
    investments,
    assets,
    invoices,
    debts,
    liabilities,
    netWorth: Math.round((assets - liabilities) * 100) / 100,
  };
}

/** Registra ponto mensal de patrimônio (idempotente por YYYY-MM). */
export function recordWealthSnapshot(
  snapshot: VaultSnapshot,
  today = new Date(),
): VaultSnapshot {
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const breakdown = wealthBreakdown(snapshot);
  const point: WealthSnapshot = {
    periodKey: key,
    date: today.toISOString().slice(0, 10),
    assets: breakdown.assets,
    liabilities: breakdown.liabilities,
    netWorth: breakdown.netWorth,
  };
  const existing = snapshot.wealthHistory ?? [];
  const prev = existing.find((p) => p.periodKey === key);
  if (
    prev &&
    prev.assets === point.assets &&
    prev.liabilities === point.liabilities &&
    prev.netWorth === point.netWorth
  ) {
    return snapshot;
  }
  const without = existing.filter((p) => p.periodKey !== key);
  return touchSnapshot(snapshot, {
    wealthHistory: [...without, point].sort((a, b) =>
      a.periodKey.localeCompare(b.periodKey),
    ),
  });
}

export function wealthHistorySeries(snapshot: VaultSnapshot): WealthSnapshot[] {
  const history = [...(snapshot.wealthHistory ?? [])];
  const current = wealthBreakdown(snapshot);
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  if (!history.some((p) => p.periodKey === key)) {
    history.push({
      periodKey: key,
      date: today.toISOString().slice(0, 10),
      assets: current.assets,
      liabilities: current.liabilities,
      netWorth: current.netWorth,
    });
  } else {
    const idx = history.findIndex((p) => p.periodKey === key);
    history[idx] = {
      periodKey: key,
      date: today.toISOString().slice(0, 10),
      assets: current.assets,
      liabilities: current.liabilities,
      netWorth: current.netWorth,
    };
  }
  return history.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

/** Garante consistência com netWorthLedger. */
export function assertWealthMatchesLedger(snapshot: VaultSnapshot): number {
  const w = wealthBreakdown(snapshot);
  const ledger = netWorthLedger({
    accounts: snapshot.accounts ?? [],
    transactions: snapshot.transactions ?? [],
    investments:
      (snapshot.investmentPositions ?? []).length > 0
        ? snapshot.investmentPositions
        : snapshot.investments.map((i) => ({
            id: i.id,
            name: i.name,
            amount: i.amount,
            classification: i.classification,
            categoryId: i.categoryId,
            institutionId: i.institutionId,
            institutionOther: i.institutionOther,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt,
          })),
    invoices: snapshot.invoices ?? [],
    debts: snapshot.debts,
  });
  return Math.round((w.netWorth - ledger) * 100) / 100;
}
