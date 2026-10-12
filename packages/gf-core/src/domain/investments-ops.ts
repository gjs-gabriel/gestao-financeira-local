import { createId } from "./ids";
import { upsertEntity, touchSnapshot } from "./snapshot";
import type { VaultSnapshot } from "./types";
import type { Transaction } from "./ledger-types";
import { upsertInvestmentSynced, defaultAccountId } from "./sync";

/**
 * Aporte: reduz saldo da conta e aumenta posição (não é despesa).
 */
export function contributeToInvestment(
  snapshot: VaultSnapshot,
  input: {
    investmentId: string;
    amount: number;
    date: string;
    accountId?: string;
    description?: string;
  },
): VaultSnapshot {
  if (input.amount <= 0) throw new Error("Valor inválido");
  const inv = snapshot.investments.find((i) => i.id === input.investmentId);
  if (!inv) throw new Error("Aplicação não encontrada");
  const accountId = input.accountId ?? defaultAccountId(snapshot);
  const now = new Date().toISOString();

  const buy: Transaction = {
    id: createId("tx"),
    kind: "investment_buy",
    date: input.date,
    amount: input.amount,
    description: input.description ?? `Aporte · ${inv.name}`,
    accountId,
    status: "confirmed",
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };

  let next = upsertEntity(snapshot, "transactions", buy);
  next = upsertInvestmentSynced(next, {
    ...inv,
    amount: inv.amount + input.amount,
    updatedAt: now,
  });
  return touchSnapshot(next, {});
}

/**
 * Resgate: aumenta conta e reduz posição (não é receita, salvo rendimento separado).
 */
export function redeemFromInvestment(
  snapshot: VaultSnapshot,
  input: {
    investmentId: string;
    amount: number;
    date: string;
    accountId?: string;
    /** Parte do valor que é rendimento (registrada como income). */
    yieldAmount?: number;
    description?: string;
  },
): VaultSnapshot {
  if (input.amount <= 0) throw new Error("Valor inválido");
  const inv = snapshot.investments.find((i) => i.id === input.investmentId);
  if (!inv) throw new Error("Aplicação não encontrada");
  if (input.amount > inv.amount + 1e-6) {
    throw new Error("Resgate maior que o saldo da aplicação");
  }
  const accountId = input.accountId ?? defaultAccountId(snapshot);
  const now = new Date().toISOString();
  const yieldAmount = Math.max(0, input.yieldAmount ?? 0);

  const sell: Transaction = {
    id: createId("tx"),
    kind: "investment_sell",
    date: input.date,
    amount: input.amount,
    description: input.description ?? `Resgate · ${inv.name}`,
    accountId,
    status: "confirmed",
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };

  let next = upsertEntity(snapshot, "transactions", sell);
  if (yieldAmount > 0) {
    const income: Transaction = {
      id: createId("tx"),
      kind: "income",
      date: input.date,
      amount: yieldAmount,
      description: `Rendimento · ${inv.name}`,
      accountId,
      categoryId: undefined,
      status: "confirmed",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    };
    next = upsertEntity(next, "transactions", income);
  }
  next = upsertInvestmentSynced(next, {
    ...inv,
    amount: Math.round((inv.amount - input.amount) * 100) / 100,
    updatedAt: now,
  });
  return touchSnapshot(next, {});
}
