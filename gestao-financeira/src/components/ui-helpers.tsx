"use client";

import { formatBrl } from "@/domain";

export function Money({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const tone =
    value > 0
      ? "text-emerald-800"
      : value < 0
        ? "text-rose-800"
        : "text-foreground";
  return (
    <span className={`${tone} tabular-nums ${className ?? ""}`}>
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
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border/80 bg-muted/30 px-5 py-8">
      <h3 className="font-heading text-lg font-medium">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function parseMoneyInput(raw: string): number {
  const cleaned = raw
    .replace(/R\$\s?/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}
