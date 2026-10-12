"use client";

import type { PluggyLogLine, PluggySyncReport } from "@/domain";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<
  PluggyLogLine["level"],
  { mark: string; className: string }
> = {
  ok: { mark: "✓", className: "text-emerald-700 dark:text-emerald-400" },
  info: { mark: "·", className: "text-muted-foreground" },
  warn: { mark: "!", className: "text-amber-700 dark:text-amber-400" },
  error: { mark: "✕", className: "text-destructive" },
};

function LogLines({ lines }: { lines: PluggyLogLine[] }) {
  return (
    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        const style = LEVEL_STYLE[line.level];
        return (
          <li key={`${i}-${line.text.slice(0, 24)}`} className={style.className}>
            <span className="mr-1.5 inline-block w-3 text-center opacity-80">
              {style.mark}
            </span>
            {line.text}
          </li>
        );
      })}
    </ul>
  );
}

export function PluggySyncLog({
  report,
  title = "Log Open Finance",
  className,
}: {
  report: PluggySyncReport;
  title?: string;
  className?: string;
}) {
  const hasError = report.lines.some((l) => l.level === "error");
  const hasWarn = report.lines.some((l) => l.level === "warn");

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        hasError
          ? "border-destructive/40 bg-destructive/5"
          : hasWarn
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border bg-muted/30",
        className,
      )}
    >
      <p className="type-label text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        API: {report.fetched.bankAccounts} conta(s),{" "}
        {report.fetched.creditAccounts} cartão(ões),{" "}
        {report.fetched.transactions} lanç., {report.fetched.investments}{" "}
        inv., {report.fetched.bills} fatura(s), {report.fetched.loans}{" "}
        empréstimo(s)
      </p>
      <LogLines lines={report.lines} />
    </div>
  );
}

/** Mensagem simples (salvar itemIds, TTL, etc.) no mesmo visual do log. */
export function PluggySimpleLog({
  message,
  tone = "info",
  title = "Open Finance",
}: {
  message: string;
  tone?: PluggyLogLine["level"];
  title?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        tone === "error"
          ? "border-destructive/40 bg-destructive/5"
          : tone === "warn"
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border bg-muted/30",
      )}
    >
      <p className="type-label text-foreground">{title}</p>
      <LogLines lines={[{ level: tone, text: message }]} />
    </div>
  );
}
