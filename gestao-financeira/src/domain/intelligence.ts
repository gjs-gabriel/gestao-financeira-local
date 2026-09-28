/**
 * Camada de inteligência local (V3) — só sugestões.
 * Nunca altera o cofre sem confirmação explícita do usuário.
 */

import { normalizeToMonthly } from "./calculations";
import { expensesByCategoryForMonth } from "./calculations";
import { cashflowLastMonths, monthKey } from "./cashflow";
import { shiftMonth } from "./insights";
import { invoiceAmount } from "./ledger";
import { projectedCashflow } from "./insights";
import { matchCategorizationRule } from "./budgets";
import type { VaultSnapshot } from "./types";
import type { RecurrenceFrequency } from "./types";

function normalizeDesc(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const v =
    values.reduce((sum, x) => sum + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export interface RecurrenceCandidate {
  key: string;
  name: string;
  amount: number;
  occurrences: number;
  months: string[];
  suggestedFrequency: RecurrenceFrequency;
  confidence: "alta" | "media" | "baixa";
  sampleIds: string[];
  categoryId?: string;
  alreadyRecurring: boolean;
}

/** Agrupa gastos pontuais parecidos em vários meses. */
export function detectRecurringCandidates(
  snapshot: VaultSnapshot,
  opts?: { minOccurrences?: number },
): RecurrenceCandidate[] {
  const minOcc = opts?.minOccurrences ?? 3;
  const groups = new Map<
    string,
    { name: string; amounts: number[]; months: Set<string>; ids: string[]; categoryId?: string }
  >();

  for (const e of snapshot.oneTimeExpenses) {
    const key = normalizeDesc(e.name);
    if (key.length < 3) continue;
    const month = e.date.slice(0, 7);
    let g = groups.get(key);
    if (!g) {
      g = {
        name: e.name.slice(0, 80),
        amounts: [],
        months: new Set(),
        ids: [],
        categoryId: e.categoryId,
      };
      groups.set(key, g);
    }
    g.amounts.push(e.amount);
    g.months.add(month);
    g.ids.push(e.id);
    if (e.categoryId) g.categoryId = e.categoryId;
  }

  for (const tx of snapshot.transactions ?? []) {
    if (tx.kind !== "expense" && tx.kind !== "card_purchase") continue;
    if (tx.status === "ignored" || tx.status === "duplicate") continue;
    const key = normalizeDesc(tx.description);
    if (key.length < 3) continue;
    const month = tx.date.slice(0, 7);
    let g = groups.get(key);
    if (!g) {
      g = {
        name: tx.description.slice(0, 80),
        amounts: [],
        months: new Set(),
        ids: [],
        categoryId: tx.categoryId,
      };
      groups.set(key, g);
    }
    g.amounts.push(tx.amount);
    g.months.add(month);
    g.ids.push(tx.id);
    if (tx.categoryId) g.categoryId = tx.categoryId;
  }

  const existingNames = new Set(
    [
      ...snapshot.recurringExpenses.map((e) => normalizeDesc(e.name)),
      ...(snapshot.recurringRules ?? [])
        .filter((r) => r.kind === "expense")
        .map((r) => normalizeDesc(r.name)),
    ].filter(Boolean),
  );

  const out: RecurrenceCandidate[] = [];
  for (const [key, g] of groups) {
    if (g.months.size < minOcc) continue;
    const avg = mean(g.amounts);
    const sd = stddev(g.amounts);
    const cv = avg > 0 ? sd / avg : 1;
    if (cv > 0.35) continue; // valores muito irregulares
    const months = [...g.months].sort();
    let gaps = 0;
    for (let i = 1; i < months.length; i++) {
      const [y1, m1] = months[i - 1]!.split("-").map(Number);
      const [y2, m2] = months[i]!.split("-").map(Number);
      const diff = (y2! - y1!) * 12 + (m2! - m1!);
      if (diff > 1) gaps += diff - 1;
    }
    const confidence: RecurrenceCandidate["confidence"] =
      g.months.size >= 5 && cv < 0.15 && gaps === 0
        ? "alta"
        : g.months.size >= 3 && cv < 0.25
          ? "media"
          : "baixa";
    out.push({
      key,
      name: g.name,
      amount: Math.round(avg * 100) / 100,
      occurrences: g.months.size,
      months,
      suggestedFrequency: "monthly",
      confidence,
      sampleIds: g.ids.slice(0, 5),
      categoryId: g.categoryId,
      alreadyRecurring: existingNames.has(key),
    });
  }
  return out
    .filter((c) => !c.alreadyRecurring)
    .sort((a, b) => b.occurrences - a.occurrences || b.amount - a.amount);
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: "alta" | "media" | "baixa";
  reason: string;
}

/** Sugere categoria pelo histórico do próprio usuário (+ regras). */
export function suggestCategoryFromHistory(
  snapshot: VaultSnapshot,
  description: string,
  institutionId?: string,
): CategorySuggestion | null {
  const rule = matchCategorizationRule(snapshot.categorizationRules ?? [], {
    description,
    institutionId,
  });
  if (rule) {
    const cat = snapshot.categories.find((c) => c.id === rule.categoryId);
    return {
      categoryId: rule.categoryId,
      categoryName: cat?.name ?? "Categoria",
      confidence: "alta",
      reason: `Regra “${rule.name}”`,
    };
  }

  const key = normalizeDesc(description);
  if (key.length < 3) return null;

  const counts = new Map<string, number>();
  const bump = (categoryId: string | undefined) => {
    if (!categoryId) return;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  };

  for (const e of snapshot.oneTimeExpenses) {
    if (normalizeDesc(e.name) === key || normalizeDesc(e.name).includes(key) || key.includes(normalizeDesc(e.name))) {
      bump(e.categoryId);
    }
  }
  for (const tx of snapshot.transactions ?? []) {
    if (tx.kind !== "expense" && tx.kind !== "card_purchase") continue;
    const d = normalizeDesc(tx.description);
    if (d === key || d.includes(key) || key.includes(d)) bump(tx.categoryId);
  }

  let bestId: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      bestId = id;
      bestCount = n;
    }
  }
  if (!bestId || bestCount < 1) return null;
  const cat = snapshot.categories.find((c) => c.id === bestId);
  return {
    categoryId: bestId,
    categoryName: cat?.name ?? "Categoria",
    confidence: bestCount >= 3 ? "alta" : bestCount >= 2 ? "media" : "baixa",
    reason: `Apareceu ${bestCount}x no seu histórico com essa categoria`,
  };
}

export type AnomalyKind =
  | "category_above_average"
  | "unusual_amount"
  | "invoice_above_average"
  | "surplus_drop";

export interface AnomalyInsight {
  id: string;
  kind: AnomalyKind;
  title: string;
  message: string;
  severity: "info" | "warning";
}

/** Alterações relevantes — linguagem neutra, sem julgamento. */
export function detectAnomalies(
  snapshot: VaultSnapshot,
  today = new Date(),
): AnomalyInsight[] {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const insights: AnomalyInsight[] = [];
  const series = cashflowLastMonths(snapshot, year, month, 6);

  // Categoria vs média dos 5 meses anteriores
  const currentCats = expensesByCategoryForMonth(snapshot, year, month);
  for (const cat of currentCats.slice(0, 8)) {
    const past: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const p = shiftMonth(year, month, -i);
      const rows = expensesByCategoryForMonth(snapshot, p.year, p.month);
      past.push(rows.find((r) => r.categoryId === cat.categoryId)?.amount ?? 0);
    }
    const avg = mean(past);
    if (avg > 20 && cat.amount > avg * 1.5) {
      const pct = Math.round(((cat.amount - avg) / avg) * 100);
      insights.push({
        id: `cat-${cat.categoryId}`,
        kind: "category_above_average",
        title: `${cat.categoryName} acima da média recente`,
        message: `Este mês está cerca de ${pct}% acima da média dos últimos meses (${avg.toFixed(0)} → ${cat.amount.toFixed(0)}).`,
        severity: "warning",
      });
    }
  }

  // Lançamento incomum vs média da categoria
  const prefix = monthKey(year, month);
  for (const e of snapshot.oneTimeExpenses) {
    if (!e.date.startsWith(prefix) || !e.categoryId) continue;
    const hist = snapshot.oneTimeExpenses
      .filter((x) => x.categoryId === e.categoryId && x.id !== e.id)
      .map((x) => x.amount);
    if (hist.length < 3) continue;
    const m = mean(hist);
    const sd = stddev(hist);
    if (sd > 0 && e.amount > m + 2.5 * sd) {
      insights.push({
        id: `amt-${e.id}`,
        kind: "unusual_amount",
        title: `Valor incomum em ${e.name}`,
        message: `R$ ${e.amount.toFixed(2)} está bem acima do usual nesta categoria (média ~R$ ${m.toFixed(2)}).`,
        severity: "info",
      });
    }
  }

  // Fatura vs média
  for (const card of snapshot.creditCards ?? []) {
    const invoices = (snapshot.invoices ?? []).filter(
      (i) => i.creditCardId === card.id,
    );
    if (invoices.length < 2) continue;
    const open = invoices.find((i) => i.status !== "paid");
    if (!open) continue;
    const current = invoiceAmount(open, snapshot.transactions ?? []);
    const paidAvg = mean(
      invoices
        .filter((i) => i.id !== open.id)
        .map((i) => invoiceAmount(i, snapshot.transactions ?? [])),
    );
    if (paidAvg > 50 && current > paidAvg * 1.4) {
      insights.push({
        id: `inv-${open.id}`,
        kind: "invoice_above_average",
        title: `Fatura ${card.name} acima da média`,
        message: `A fatura atual (R$ ${current.toFixed(2)}) está acima da média recente (R$ ${paidAvg.toFixed(2)}).`,
        severity: "warning",
      });
    }
  }

  // Queda de sobra
  if (series.length >= 3) {
    const last = series[series.length - 1]!;
    const prevAvg = mean(series.slice(0, -1).map((p) => p.surplus));
    if (prevAvg > 100 && last.surplus < prevAvg * 0.5) {
      insights.push({
        id: "surplus-drop",
        kind: "surplus_drop",
        title: "Sobra do mês abaixo do ritmo recente",
        message: `O saldo deste mês (${last.surplus.toFixed(0)}) ficou bem abaixo da média dos meses anteriores (${prevAvg.toFixed(0)}).`,
        severity: "info",
      });
    }
  }

  return insights.slice(0, 12);
}

export interface ForecastMonth {
  key: string;
  label: string;
  confirmedIncome: number;
  confirmedExpense: number;
  recurringIncome: number;
  recurringExpense: number;
  estimatedExpense: number;
  totalIncome: number;
  totalExpense: number;
  surplus: number;
  projected: boolean;
}

/**
 * Previsão separando confirmado (lançamentos datados), recorrente e estimativa
 * (candidatos de recorrência ainda não cadastrados).
 */
export function forecastDetailed(
  snapshot: VaultSnapshot,
  months = 6,
  today = new Date(),
): ForecastMonth[] {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const base = projectedCashflow(snapshot, year, month, months, today);
  const candidates = detectRecurringCandidates(snapshot).filter(
    (c) => c.confidence !== "baixa",
  );
  const estimatedMonthly = candidates.reduce((s, c) => s + c.amount, 0);

  return base.map((p) => {
    const incomes = snapshot.incomes.reduce((s, i) => s + i.amount, 0);
    const oneTimeIn = (snapshot.oneTimeIncomes ?? [])
      .filter((i) => i.date.startsWith(p.key))
      .reduce((s, i) => s + i.amount, 0);
    const recExp = snapshot.recurringExpenses.reduce(
      (s, e) => s + normalizeToMonthly(e.amount, e.frequency),
      0,
    );
    const oneTimeExp = snapshot.oneTimeExpenses
      .filter((e) => e.date.startsWith(p.key))
      .reduce((s, e) => s + e.amount, 0);
    const cardExp = (snapshot.transactions ?? [])
      .filter(
        (tx) =>
          tx.kind === "card_purchase" &&
          tx.date.startsWith(p.key) &&
          tx.status !== "ignored",
      )
      .reduce((s, tx) => s + tx.amount, 0);

    const estimatedExpense = p.projected
      ? Math.round(estimatedMonthly * 0.5 * 100) / 100
      : 0;

    return {
      key: p.key,
      label: p.label,
      confirmedIncome: oneTimeIn,
      confirmedExpense: oneTimeExp + cardExp,
      recurringIncome: incomes,
      recurringExpense: recExp,
      estimatedExpense,
      totalIncome: Math.round(p.income * 100) / 100,
      totalExpense: Math.round((p.expenses + estimatedExpense) * 100) / 100,
      surplus: Math.round((p.surplus - estimatedExpense) * 100) / 100,
      projected: p.projected,
    };
  });
}

export interface PortfolioInsight {
  byClass: { name: string; amount: number; pct: number }[];
  byInstitution: { name: string; amount: number; pct: number }[];
  concentration: { name: string; pct: number } | null;
  contributionsLast12m: number;
  redemptionsLast12m: number;
  total: number;
}

export function analyzePortfolio(snapshot: VaultSnapshot): PortfolioInsight {
  const positions =
    (snapshot.investmentPositions ?? []).length > 0
      ? snapshot.investmentPositions!
      : snapshot.investments.map((i) => ({
          name: i.name,
          amount: i.amount,
          classification: i.classification,
          institutionId: i.institutionId,
          institutionOther: i.institutionOther,
        }));

  const total = positions.reduce((s, p) => s + p.amount, 0);
  const classMap = new Map<string, number>();
  const instMap = new Map<string, number>();
  for (const p of positions) {
    const cls =
      "classification" in p
        ? String(p.classification)
        : "outro";
    classMap.set(cls, (classMap.get(cls) ?? 0) + p.amount);
    const inst =
      snapshot.institutions.find((i) => i.id === p.institutionId)?.name ??
      p.institutionOther ??
      "Sem instituição";
    instMap.set(inst, (instMap.get(inst) ?? 0) + p.amount);
  }

  const toRows = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([name, amount]) => ({
        name,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

  const byClass = toRows(classMap);
  const byInstitution = toRows(instMap);
  const top = byInstitution[0] ?? byClass[0];
  const concentration =
    top && top.pct >= 40
      ? { name: top.name, pct: top.pct }
      : null;

  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const cutoff = yearAgo.toISOString().slice(0, 10);
  let contributionsLast12m = 0;
  let redemptionsLast12m = 0;
  for (const tx of snapshot.transactions ?? []) {
    if (tx.date < cutoff) continue;
    if (tx.kind === "investment_buy") contributionsLast12m += tx.amount;
    if (tx.kind === "investment_sell") redemptionsLast12m += tx.amount;
  }

  return {
    byClass,
    byInstitution,
    concentration,
    contributionsLast12m: Math.round(contributionsLast12m * 100) / 100,
    redemptionsLast12m: Math.round(redemptionsLast12m * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export function buildIntelligenceReport(
  snapshot: VaultSnapshot,
  today = new Date(),
) {
  return {
    recurrencies: detectRecurringCandidates(snapshot),
    anomalies: detectAnomalies(snapshot, today),
    forecast: forecastDetailed(snapshot, 6, today),
    portfolio: analyzePortfolio(snapshot),
  };
}
