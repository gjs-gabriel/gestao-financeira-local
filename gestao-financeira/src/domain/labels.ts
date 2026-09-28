import type {
  CategoryKind,
  IncomeType,
  InvestmentClass,
  RecurrenceFrequency,
} from "./types";

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: "Salário",
  vr: "Vale-refeição (VR)",
  va: "Vale-alimentação (VA)",
  other: "Outro",
};

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export const INVESTMENT_CLASS_LABELS: Record<InvestmentClass, string> = {
  renda_fixa: "Renda fixa",
  acoes: "Ações",
  fiis: "FIIs",
  etfs: "ETFs",
  cripto: "Cripto",
  previdencia: "Previdência",
  poupanca: "Poupança",
  outro: "Outro",
};

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Renda",
  investment: "Aplicação",
  expense: "Gasto",
  general: "Geral",
};

/** Formata BRL no domínio como string (sem Intl de browser — usa formatação simples). */
export function formatBrl(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}R$ ${withDots},${decPart}`;
}
