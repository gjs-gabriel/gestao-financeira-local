import { createSeedCategories } from "./seeds";
import {
  createSeedInstitutions,
  matchInstitutionByName,
} from "./institutions";
import { buildLedgerFromLegacy } from "./migrate";
import { emptyLedgerFields } from "./ledger";
import {
  SNAPSHOT_SCHEMA_VERSION,
  type Category,
  type Debt,
  type Goal,
  type Income,
  type Institution,
  type InstallmentExpense,
  type Investment,
  type OneTimeExpense,
  type OneTimeIncome,
  type RecurringExpense,
  type VaultSnapshot,
  type WithInstitution,
} from "./types";
import type {
  Account,
  CreditCard,
  CreditCardInvoice,
  InstallmentPlan,
  InvestmentPosition,
  RecurringRule,
  Transaction,
} from "./ledger-types";

export function createEmptySnapshot(
  now = new Date().toISOString(),
): VaultSnapshot {
  const ledger = emptyLedgerFields(now);
  const openingDate = now.slice(0, 10);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: now,
    incomes: [],
    oneTimeIncomes: [],
    investments: [],
    recurringExpenses: [],
    oneTimeExpenses: [],
    installmentExpenses: [],
    debts: [],
    goals: [],
    categories: createSeedCategories(now),
    institutions: createSeedInstitutions(now),
    ...ledger,
    accounts: [
      {
        id: "acc_principal",
        name: "Conta principal",
        type: "checking",
        openingBalance: 0,
        openingDate,
        currency: "BRL",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function touchSnapshot(
  snapshot: VaultSnapshot,
  patch: Partial<Omit<VaultSnapshot, "schemaVersion">>,
): VaultSnapshot {
  return {
    ...snapshot,
    ...patch,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

export function upsertById<T extends { id: string }>(
  list: T[],
  item: T,
): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function removeById<T extends { id: string }>(
  list: T[],
  id: string,
): T[] {
  return list.filter((x) => x.id !== id);
}

export type SnapshotListKey =
  | "incomes"
  | "oneTimeIncomes"
  | "investments"
  | "recurringExpenses"
  | "oneTimeExpenses"
  | "installmentExpenses"
  | "debts"
  | "goals"
  | "categories"
  | "institutions"
  | "accounts"
  | "creditCards"
  | "transactions"
  | "invoices"
  | "installmentPlans"
  | "recurringRules"
  | "investmentPositions"
  | "budgets"
  | "categorizationRules";

export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "incomes",
  item: Income,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "oneTimeIncomes",
  item: OneTimeIncome,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "investments",
  item: Investment,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "recurringExpenses",
  item: RecurringExpense,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "oneTimeExpenses",
  item: OneTimeExpense,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "installmentExpenses",
  item: InstallmentExpense,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "accounts",
  item: Account,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "creditCards",
  item: CreditCard,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "transactions",
  item: Transaction,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "invoices",
  item: CreditCardInvoice,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "installmentPlans",
  item: InstallmentPlan,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "recurringRules",
  item: RecurringRule,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "investmentPositions",
  item: InvestmentPosition,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "budgets",
  item: import("./v15-types").Budget,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "categorizationRules",
  item: import("./v15-types").CategorizationRule,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "debts",
  item: Debt,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "goals",
  item: Goal,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "categories",
  item: Category,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: "institutions",
  item: Institution,
): VaultSnapshot;
export function upsertEntity(
  snapshot: VaultSnapshot,
  key: SnapshotListKey,
  item: { id: string },
): VaultSnapshot {
  const list = (snapshot[key] as { id: string }[] | undefined) ?? [];
  return touchSnapshot(snapshot, {
    [key]: upsertById(list, item),
  } as Partial<VaultSnapshot>);
}

export function removeEntity(
  snapshot: VaultSnapshot,
  key: SnapshotListKey,
  id: string,
): VaultSnapshot {
  const list = (snapshot[key] as { id: string }[] | undefined) ?? [];
  return touchSnapshot(snapshot, {
    [key]: removeById(list, id),
  } as Partial<VaultSnapshot>);
}

function migrateInstitutionFields<T extends WithInstitution & { institution?: string }>(
  item: T,
  institutions: Institution[],
): T {
  if (item.institutionId) return item;
  if (item.institution) {
    const matched = matchInstitutionByName(item.institution, institutions);
    const { institution: _legacy, ...rest } = item;
    void _legacy;
    return { ...rest, ...matched } as T;
  }
  return item;
}

function mergeInstitutions(
  existing: Institution[] | undefined,
  now: string,
): Institution[] {
  const seeds = createSeedInstitutions(now);
  if (!existing?.length) return seeds;
  const byId = new Map(seeds.map((i) => [i.id, i]));
  for (const i of existing) {
    if (!byId.has(i.id)) byId.set(i.id, i);
  }
  return [...byId.values()];
}

/** Valida e migra snapshot (schema 1–4 → atual). */
export function parseSnapshot(raw: unknown): VaultSnapshot {
  if (!raw || typeof raw !== "object") {
    throw new Error("Snapshot inválido");
  }
  const s = raw as Partial<VaultSnapshot> & {
    customInstitutions?: Institution[];
  };
  if (
    s.schemaVersion !== 1 &&
    s.schemaVersion !== 2 &&
    s.schemaVersion !== 3 &&
    s.schemaVersion !== 4
  ) {
    throw new Error(
      `Versão de schema não suportada: ${String(s.schemaVersion)}`,
    );
  }
  const now = s.updatedAt ?? new Date().toISOString();
  const institutions = mergeInstitutions(
    [
      ...(Array.isArray(s.institutions) ? s.institutions : []),
      ...(Array.isArray(s.customInstitutions) ? s.customInstitutions : []),
    ],
    now,
  );

  const incomes = (Array.isArray(s.incomes) ? s.incomes : []).map((i) =>
    migrateInstitutionFields(i, institutions),
  );
  const oneTimeIncomes = (
    Array.isArray(s.oneTimeIncomes) ? s.oneTimeIncomes : []
  ).map((i) => migrateInstitutionFields(i, institutions));
  const investments = (Array.isArray(s.investments) ? s.investments : []).map(
    (i) => migrateInstitutionFields(i, institutions),
  );
  const recurringExpenses = (
    Array.isArray(s.recurringExpenses) ? s.recurringExpenses : []
  ).map((i) => migrateInstitutionFields(i, institutions));
  const oneTimeExpenses = (
    Array.isArray(s.oneTimeExpenses) ? s.oneTimeExpenses : []
  ).map((i) => migrateInstitutionFields(i, institutions));
  const installmentExpenses = (
    Array.isArray(s.installmentExpenses) ? s.installmentExpenses : []
  ).map((i) => migrateInstitutionFields(i, institutions));

  const base = {
    updatedAt: now,
    incomes,
    oneTimeIncomes,
    investments,
    recurringExpenses,
    oneTimeExpenses,
    installmentExpenses,
    debts: Array.isArray(s.debts) ? s.debts : [],
    goals: Array.isArray(s.goals) ? s.goals : [],
    categories: Array.isArray(s.categories) ? s.categories : [],
    institutions,
  };

  const ledger = buildLedgerFromLegacy(
    {
      ...base,
      schemaVersion: s.schemaVersion,
      accounts: s.accounts,
      creditCards: s.creditCards,
      transactions: s.transactions,
      invoices: s.invoices,
      installmentPlans: s.installmentPlans,
      recurringRules: s.recurringRules,
      investmentPositions: s.investmentPositions,
      budgets: Array.isArray(s.budgets) ? s.budgets : [],
      categorizationRules: Array.isArray(s.categorizationRules)
        ? s.categorizationRules
        : [],
    } as VaultSnapshot,
    now,
  );

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    ...base,
    ...ledger,
    budgets: Array.isArray(s.budgets) ? s.budgets : ledger.budgets ?? [],
    categorizationRules: Array.isArray(s.categorizationRules)
      ? s.categorizationRules
      : ledger.categorizationRules ?? [],
    wealthHistory: Array.isArray(s.wealthHistory)
      ? s.wealthHistory
      : ledger.wealthHistory ?? [],
  };
}
