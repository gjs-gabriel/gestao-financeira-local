import type { PluggyFetchBundle } from "@/infra/pluggy/types";
import type { Transaction } from "./ledger-types";
import { accountBalance } from "./ledger";
import {
  mapPluggyBundle,
  type MappedPluggyBundle,
} from "./mappers/pluggy-mapper";
import {
  buildPluggySyncReport,
  type PluggySyncReport,
} from "./pluggy-sync-report";
import { touchSnapshot, upsertEntity } from "./snapshot";
import {
  upsertAccount,
  upsertInstallmentSynced,
  upsertInvestmentSynced,
  upsertOneTimeExpenseSynced,
  upsertOneTimeIncomeSynced,
} from "./sync";
import type { OpenFinanceSyncState, VaultSnapshot } from "./types";
import { recordWealthSnapshot } from "./wealth";

export const PLUGGY_SYNC_TTL_MS = 24 * 60 * 60 * 1000;

export type { PluggyLogLevel, PluggyLogLine, PluggySyncReport } from "./pluggy-sync-report";
export { buildPluggySyncReport, pluggyErrorReport } from "./pluggy-sync-report";

export interface ApplyPluggyOptions {
  itemIds: string[];
  fetchedAt: string;
}

export interface PluggySyncSkipResult {
  skipped: true;
  reason: "ttl";
  lastSyncedAt: string;
  snapshot: VaultSnapshot;
}

export interface PluggySyncAppliedResult {
  skipped: false;
  snapshot: VaultSnapshot;
  fetchedAt: string;
  report: PluggySyncReport;
}

export type PluggySyncResult = PluggySyncSkipResult | PluggySyncAppliedResult;

export function shouldSkipPluggySync(
  snapshot: VaultSnapshot,
  force: boolean,
  now = Date.now(),
): string | null {
  if (force) return null;
  const last = snapshot.openFinance?.lastSyncedAt;
  if (!last) return null;
  const ts = Date.parse(last);
  if (!Number.isFinite(ts)) return null;
  if (now - ts < PLUGGY_SYNC_TTL_MS) return last;
  return null;
}

function resolveAccountIdForExpense(
  snapshot: VaultSnapshot,
  mapped: MappedPluggyBundle,
): string {
  const pluggyBank = mapped.accounts[0]?.id;
  if (pluggyBank) return pluggyBank;
  const active = (snapshot.accounts ?? []).find((a) => a.status === "active");
  return active?.id ?? "acc_principal";
}

function calibrateOpeningBalances(
  snapshot: VaultSnapshot,
  targets: Record<string, number>,
): VaultSnapshot {
  let next = snapshot;
  for (const [accountId, target] of Object.entries(targets)) {
    const account = (next.accounts ?? []).find((a) => a.id === accountId);
    if (!account) continue;
    const current = accountBalance(account, next.transactions ?? []);
    const delta = Math.round((target - current) * 100) / 100;
    if (Math.abs(delta) < 0.005) continue;
    next = upsertAccount(next, {
      ...account,
      openingBalance: Math.round((account.openingBalance + delta) * 100) / 100,
      updatedAt: new Date().toISOString(),
    });
  }
  return next;
}

function upsertCardPurchase(
  snapshot: VaultSnapshot,
  purchase: MappedPluggyBundle["cardPurchases"][number],
  now: string,
): VaultSnapshot {
  const tx: Transaction = {
    id: purchase.id.startsWith("tx_") ? purchase.id : `tx_${purchase.id}`,
    kind: "card_purchase",
    date: purchase.date,
    amount: purchase.amount,
    description: purchase.description,
    categoryId: purchase.categoryId,
    creditCardId: purchase.creditCardId,
    invoiceId: purchase.invoiceId,
    status: "confirmed",
    source: "import",
    importHash: purchase.importHash,
    createdAt: now,
    updatedAt: now,
  };
  return upsertEntity(snapshot, "transactions", tx);
}

/** Aplica bundle já mapeado ao snapshot (puro). */
export function applyPluggyMappedBundle(
  snapshot: VaultSnapshot,
  mapped: MappedPluggyBundle,
  opts: ApplyPluggyOptions,
): VaultSnapshot {
  const now = opts.fetchedAt;
  let next = snapshot;
  const accountId = resolveAccountIdForExpense(next, mapped);

  for (const account of mapped.accounts) {
    next = upsertAccount(next, account);
  }
  for (const card of mapped.creditCards) {
    next = upsertEntity(next, "creditCards", card);
  }
  for (const invoice of mapped.invoices) {
    next = upsertEntity(next, "invoices", invoice);
  }
  for (const purchase of mapped.cardPurchases) {
    next = upsertCardPurchase(next, purchase, now);
  }
  for (const expense of mapped.oneTimeExpenses) {
    next = upsertOneTimeExpenseSynced(next, expense, {
      source: "import",
      accountId,
      importHash: `pluggy:${expense.id.replace(/^pluggy_tx_/, "")}`,
    });
  }
  for (const income of mapped.oneTimeIncomes) {
    next = upsertOneTimeIncomeSynced(next, income, {
      source: "import",
      accountId,
      importHash: `pluggy:${income.id.replace(/^pluggy_tx_/, "")}`,
    });
  }
  for (const plan of mapped.installmentExpenses) {
    next = upsertInstallmentSynced(next, plan);
  }
  for (const inv of mapped.investments) {
    next = upsertInvestmentSynced(next, inv);
  }
  for (const debt of mapped.debts) {
    next = upsertEntity(next, "debts", debt);
  }

  next = calibrateOpeningBalances(next, mapped.targetBalances);

  const prev = next.openFinance;
  const openFinance: OpenFinanceSyncState = {
    provider: "pluggy",
    itemIds: opts.itemIds,
    lastSyncedAt: opts.fetchedAt,
    idMaps: {
      accounts: { ...(prev?.idMaps.accounts ?? {}), ...mapped.idMaps.accounts },
      creditCards: {
        ...(prev?.idMaps.creditCards ?? {}),
        ...mapped.idMaps.creditCards,
      },
      investments: {
        ...(prev?.idMaps.investments ?? {}),
        ...mapped.idMaps.investments,
      },
    },
  };

  next = touchSnapshot(next, { openFinance });
  return recordWealthSnapshot(next, new Date(opts.fetchedAt));
}

export interface MergePluggyFetchResult {
  snapshot: VaultSnapshot;
  report: PluggySyncReport;
}

/** Mapeia + aplica um fetch bundle da API. */
export function mergePluggyFetchBundle(
  snapshot: VaultSnapshot,
  bundle: PluggyFetchBundle,
  itemIds?: string[],
): VaultSnapshot {
  return mergePluggyFetchBundleDetailed(snapshot, bundle, itemIds).snapshot;
}

/** Como mergePluggyFetchBundle, mas devolve também o relatório de sync. */
export function mergePluggyFetchBundleDetailed(
  snapshot: VaultSnapshot,
  bundle: PluggyFetchBundle,
  itemIds?: string[],
): MergePluggyFetchResult {
  const resolvedIds =
    itemIds ??
    snapshot.openFinance?.itemIds ??
    bundle.items.map((i) => i.itemId);
  const mapped = mapPluggyBundle(bundle, bundle.fetchedAt);
  const next = applyPluggyMappedBundle(snapshot, mapped, {
    itemIds: resolvedIds,
    fetchedAt: bundle.fetchedAt,
  });
  return {
    snapshot: next,
    report: buildPluggySyncReport(bundle, mapped, resolvedIds),
  };
}

export function resolvePluggyItemIds(
  snapshot: VaultSnapshot,
  override?: string[],
): string[] {
  if (override && override.length > 0) {
    return [...new Set(override.map((id) => id.trim()).filter(Boolean))];
  }
  return [...new Set((snapshot.openFinance?.itemIds ?? []).filter(Boolean))];
}

export function updatePluggyItemIds(
  snapshot: VaultSnapshot,
  itemIds: string[],
): VaultSnapshot {
  const cleaned = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  const prev = snapshot.openFinance;
  return touchSnapshot(snapshot, {
    openFinance: {
      provider: "pluggy",
      itemIds: cleaned,
      lastSyncedAt: prev?.lastSyncedAt,
      idMaps: prev?.idMaps ?? {
        accounts: {},
        creditCards: {},
        investments: {},
      },
    },
  });
}

/**
 * Orquestra TTL + merge. O fetch HTTP fica a cargo do caller (browser → proxy).
 */
export function applyPluggyFetchWithTtl(
  snapshot: VaultSnapshot,
  bundle: PluggyFetchBundle,
  opts?: { force?: boolean; itemIds?: string[]; now?: number },
): PluggySyncResult {
  const last = shouldSkipPluggySync(snapshot, Boolean(opts?.force), opts?.now);
  if (last) {
    return {
      skipped: true,
      reason: "ttl",
      lastSyncedAt: last,
      snapshot,
    };
  }
  const { snapshot: next, report } = mergePluggyFetchBundleDetailed(
    snapshot,
    bundle,
    opts?.itemIds,
  );
  return {
    skipped: false,
    snapshot: next,
    fetchedAt: bundle.fetchedAt,
    report,
  };
}
