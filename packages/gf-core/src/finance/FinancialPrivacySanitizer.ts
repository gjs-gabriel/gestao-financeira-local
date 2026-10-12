import type { AIContextIntent, FinancialAIContext, FinancialSnapshot } from "./types";

const FORBIDDEN_KEY_PATTERN =
  /pin|password|senha|key|salt|vault|encrypt|credential|cpf|cnpj|agencia|agência|accountNumber|cardNumber|cvv|token|secret|envelope|indexeddb|uuid|^id$|_id$/i;

const FORBIDDEN_VALUE_PATTERN =
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|(pin|senha)\s*[:=]\s*\d+/i;

/**
 * Remove campos e valores sensíveis antes de qualquer envio ao modelo.
 */
export function sanitizeFinancialData(
  input: unknown,
  depth = 0,
): unknown {
  if (depth > 12) return null;
  if (input === null || input === undefined) return input;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "string") {
    if (FORBIDDEN_VALUE_PATTERN.test(input)) return "[redacted]";
    // UUIDs
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input,
      )
    ) {
      return "[id]";
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeFinancialData(item, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
      if (
        /institution|merchant|description|notes|raw|iban|swift/i.test(key)
      ) {
        continue;
      }
      out[key] = sanitizeFinancialData(value, depth + 1);
    }
    return out;
  }
  return null;
}

export function sanitizeFinancialSnapshot(
  snapshot: FinancialSnapshot,
): FinancialSnapshot {
  return sanitizeFinancialData(snapshot) as FinancialSnapshot;
}

/** Verifica se um objeto (contexto) contém chaves/valores proibidos. */
export function assertAIContextIsSafe(ctx: unknown): {
  ok: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const json = JSON.stringify(ctx ?? {});
  if (/\"pin\"\s*:/i.test(json)) violations.push("contains pin field");
  if (/encryptionKey|cryptoKey|pbkdf|aes-gcm/i.test(json)) {
    violations.push("contains encryption material");
  }
  if (/indexedDB|IDBDatabase/i.test(json)) {
    violations.push("contains indexeddb reference");
  }
  if (FORBIDDEN_VALUE_PATTERN.test(json)) {
    violations.push("contains credential-like value");
  }
  // vaultId / profileId patterns
  if (/\"vaultId\"|\"profileId\"|\"envelope\"/i.test(json)) {
    violations.push("contains vault/profile identifiers");
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Seleciona fatia mínima do snapshot conforme a intenção.
 */
export function selectContextFacts(
  snapshot: FinancialSnapshot,
  intent: AIContextIntent,
): Record<string, unknown> {
  const s = sanitizeFinancialSnapshot(snapshot);
  switch (intent) {
    case "expenses":
    case "patterns":
      return {
        period: s.period,
        income: s.income,
        expenses: s.expenses,
        history: s.history,
      };
    case "income":
      return { period: s.period, income: s.income, history: s.history };
    case "cashflow":
    case "budget":
      return {
        period: s.period,
        income: s.income,
        expenses: s.expenses,
        cashFlow: s.cashFlow,
        commitments: s.commitments,
        debts: { total: s.debts.total, monthlyPayments: s.debts.monthlyPayments },
        goals: s.goals,
      };
    case "netWorth":
      return { period: s.period, netWorth: s.netWorth };
    case "investments":
      return {
        period: s.period,
        netWorth: s.netWorth,
        investments: s.investments,
        goals: s.goals,
        debts: { total: s.debts.total },
      };
    case "debts":
      return {
        period: s.period,
        income: s.income,
        debts: s.debts,
        commitments: s.commitments,
        cashFlow: s.cashFlow,
      };
    case "goals":
    case "scenario":
      return {
        period: s.period,
        income: s.income,
        cashFlow: s.cashFlow,
        goals: s.goals,
        debts: s.debts,
        investments: { total: s.investments.total },
        netWorth: { current: s.netWorth.current },
      };
    case "alerts":
      return {
        period: s.period,
        income: s.income,
        expenses: s.expenses,
        cashFlow: s.cashFlow,
        commitments: s.commitments,
        goals: s.goals,
        debts: s.debts,
        netWorth: s.netWorth,
      };
    case "overview":
    case "chat":
    default:
      return {
        period: s.period,
        income: s.income,
        expenses: {
          current: s.expenses.current,
          monthlyAverage: s.expenses.monthlyAverage,
          variation: s.expenses.variation,
          byCategory: s.expenses.byCategory.slice(0, 8),
        },
        cashFlow: s.cashFlow,
        netWorth: {
          current: s.netWorth.current,
          variation12m: s.netWorth.variation12m,
        },
        investments: {
          total: s.investments.total,
          allocation: s.investments.allocation,
          concentrationPct: s.investments.concentrationPct,
          concentrationClass: s.investments.concentrationClass,
        },
        debts: {
          total: s.debts.total,
          monthlyPayments: s.debts.monthlyPayments,
        },
        goals: s.goals,
        commitments: s.commitments,
      };
  }
}

export function buildFinancialAIContext(
  snapshot: FinancialSnapshot,
  intent: AIContextIntent,
  extra?: Record<string, unknown>,
): FinancialAIContext {
  const facts = {
    ...selectContextFacts(snapshot, intent),
    ...(extra ? (sanitizeFinancialData(extra) as Record<string, unknown>) : {}),
  };
  const ctx: FinancialAIContext = {
    version: 1,
    intent,
    facts,
    generatedAt: new Date().toISOString(),
  };
  const check = assertAIContextIsSafe(ctx);
  if (!check.ok) {
    throw new Error(
      `FinancialAIContext unsafe: ${check.violations.join(", ")}`,
    );
  }
  return ctx;
}
