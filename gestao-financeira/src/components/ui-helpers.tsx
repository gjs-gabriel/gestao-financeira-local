"use client";

import { formatBrl } from "@/domain";
import { cn } from "@/lib/utils";
import type { InsightTone } from "@/domain";
import type { ReactNode } from "react";

export function Money({
  value,
  className,
  tone,
}: {
  value: number;
  className?: string;
  /** Override automático positivo/negativo */
  tone?: "income" | "expense" | "investment" | "debt" | "neutral";
}) {
  const auto =
    tone ??
    (value > 0 ? "income" : value < 0 ? "expense" : "neutral");
  const toneClass =
    auto === "income"
      ? "text-income"
      : auto === "expense"
        ? "text-expense"
        : auto === "investment"
          ? "text-investment"
          : auto === "debt"
            ? "text-debt"
            : "text-foreground";
  return (
    <span className={cn("tabular-nums", toneClass, className)}>
      {formatBrl(value)}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-border/50 py-10">
      <h3 className="text-base font-medium tracking-tight">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="type-label mb-2">{eyebrow}</p> : null}
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** Superfície Nível 2 — só quando agrupa contexto. */
export function Section({
  title,
  hint,
  children,
  className,
  action,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("py-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            {title ? (
              <h2 className="text-base font-medium tracking-tight">{title}</h2>
            ) : null}
            {hint ? (
              <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone,
  large,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "income" | "expense" | "investment" | "debt" | "neutral";
  large?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="type-label">{label}</p>
      <div
        className={cn(
          "type-metric mt-1.5",
          large ? "text-3xl md:text-4xl" : "text-xl md:text-2xl",
          tone === "income" && "text-income",
          tone === "expense" && "text-expense",
          tone === "investment" && "text-investment",
          tone === "debt" && "text-debt",
        )}
      >
        {value}
      </div>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function StatGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

const TONE_BORDER: Record<InsightTone, string> = {
  neutral: "border-border/60",
  income: "border-income/30",
  expense: "border-expense/30",
  investment: "border-investment/30",
  alert: "border-debt/35",
};

export function FinancialInsight({
  title,
  description,
  tone = "neutral",
  icon,
}: {
  title: string;
  description: string;
  tone?: InsightTone;
  icon?: ReactNode;
}) {
  return (
    <div
      role="note"
      className={cn(
        "border-l-2 py-1 pl-4",
        TONE_BORDER[tone],
      )}
    >
      <div className="flex items-start gap-2">
        {icon ? (
          <span className="mt-0.5 text-muted-foreground" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  tone = "primary",
}: {
  /** 0–1 */
  value: number;
  className?: string;
  tone?: "primary" | "investment" | "expense" | "income";
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  const bar =
    tone === "investment"
      ? "bg-investment"
      : tone === "expense"
        ? "bg-expense"
        : tone === "income"
          ? "bg-income"
          : "bg-primary";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Interpreta valor monetário digitado.
 * Aceita BR (1.234,56 / 999,90) e decimal com ponto (999.9) — sem tratar
 * o ponto decimal como milhar (bug que transformava 999.9 → 9999).
 */
export function parseMoneyInput(raw: string): number {
  const s = raw.replace(/R\$\s?/gi, "").replace(/\s/g, "").trim();
  if (!s) return 0;

  let normalized: string;
  if (s.includes(",")) {
    // 1.234,56 ou 999,90
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const last = s.slice(s.lastIndexOf(".") + 1);
    const singleDot = s.indexOf(".") === s.lastIndexOf(".");
    if (singleDot && /^\d{1,2}$/.test(last)) {
      // 999.9 / 10.50 — ponto decimal
      normalized = s;
    } else {
      // 1.234 ou 1.234.567 — milhar BR
      normalized = s.replace(/\./g, "");
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Formata número para campos de input (vírgula decimal). */
export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return (Math.round(value * 100) / 100).toString().replace(".", ",");
}
