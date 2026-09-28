"use client";

import { useState } from "react";
import { formatBrl } from "@/domain";
import type {
  FinancialAlertItem,
  FinancialEvidence,
  FinancialInsightItem,
} from "@/ai/finance/types";
import { severityLabel } from "@/ai/finance/FinancialInsightEngine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AIEvidence({ evidence }: { evidence: FinancialEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-3 space-y-3 border-t border-border/40 pt-3 text-sm">
      {evidence.map((e, i) => (
        <li key={`${e.metric}-${i}`}>
          <p className="font-medium">{e.label}</p>
          <dl className="mt-1 grid gap-1 text-muted-foreground sm:grid-cols-2">
            {e.current !== undefined ? (
              <div>
                <dt className="text-xs uppercase tracking-wide">Atual</dt>
                <dd className="tabular-nums text-foreground">
                  {typeof e.current === "number" && e.current > 1
                    ? formatBrl(e.current)
                    : e.current}
                </dd>
              </div>
            ) : null}
            {e.baseline !== undefined ? (
              <div>
                <dt className="text-xs uppercase tracking-wide">Referência</dt>
                <dd className="tabular-nums text-foreground">
                  {typeof e.baseline === "number" && Math.abs(e.baseline) > 1
                    ? formatBrl(e.baseline)
                    : e.baseline}
                </dd>
              </div>
            ) : null}
            {e.variation != null ? (
              <div>
                <dt className="text-xs uppercase tracking-wide">Variação</dt>
                <dd className="tabular-nums text-foreground">
                  {(e.variation * 100).toFixed(1).replace(".", ",")}%
                </dd>
              </div>
            ) : null}
            {e.period ? (
              <div>
                <dt className="text-xs uppercase tracking-wide">Período</dt>
                <dd>{e.period}</dd>
              </div>
            ) : null}
          </dl>
          {e.details?.length ? (
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              {e.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AIInsightCard({
  item,
}: {
  item: FinancialInsightItem | FinancialAlertItem;
}) {
  const [open, setOpen] = useState(false);
  const severity = "severity" in item ? item.severity : "info";
  return (
    <article
      className={cn(
        "border-l-2 py-2 pl-4",
        severity === "warning"
          ? "border-l-debt"
          : severity === "attention"
            ? "border-l-expense"
            : "border-l-primary/40",
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {severityLabel(severity)}
      </p>
      <h3 className="mt-0.5 text-sm font-medium">{item.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 h-7 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Ocultar evidência" : "Ver evidência"}
      </Button>
      {open ? <AIEvidence evidence={item.evidence} /> : null}
    </article>
  );
}

export function AIAnalysisCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-t border-border/40 pt-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <span className="text-primary" aria-hidden>
            ✦
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
