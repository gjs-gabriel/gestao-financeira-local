/**
 * Entidades V1.5 — orçamento, regras de categorização, alertas.
 */

export interface Budget {
  id: string;
  name: string;
  categoryId: string;
  /** Limite mensal em BRL */
  limitAmount: number;
  /** Mês de referência YYYY-MM; se omitido, vale para todo mês */
  periodKey?: string;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type RuleMatchField = "description" | "institution";

export interface CategorizationRule {
  id: string;
  name: string;
  /** Campo a comparar */
  matchField: RuleMatchField;
  /** Texto contido (case-insensitive) */
  contains: string;
  categoryId: string;
  institutionId?: string;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertKind =
  | "budget_near"
  | "budget_over"
  | "invoice_due"
  | "invoice_high"
  | "projected_negative"
  | "goal_reached"
  | "installment_due"
  | "debt_due";

/** Alerta calculado (pode ser persistido ou só em memória). */
export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** ISO date relacionada */
  date?: string;
  relatedId?: string;
  dismissed?: boolean;
  createdAt: string;
}

/** Ponto mensal de patrimônio líquido. */
export interface WealthSnapshot {
  periodKey: string;
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}
