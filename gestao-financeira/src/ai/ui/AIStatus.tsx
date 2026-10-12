"use client";

import { cn } from "@/lib/utils";
import type { AIModelProgress } from "@/ai/core/types";

export function AIStatusBadge({
  status,
  className,
}: {
  status: AIModelProgress;
  className?: string;
}) {
  const isBad =
    status.status === "error" || status.status === "unsupported";
  const label =
    status.status === "ready"
      ? "Finn ativo (runtime local)"
      : status.status === "downloading"
        ? `Baixando modelo — ${Math.round(status.progress * 100)}%`
        : status.status === "loading"
          ? "Carregando modelo…"
          : status.status === "checking"
            ? "Verificando Finn…"
            : status.status === "generating"
              ? "Finn analisando…"
              : status.status === "unsupported"
                ? "Finn indisponível"
                : status.status === "disabled"
                  ? "Finn desativado"
                  : status.status === "error"
                    ? "Erro no Finn"
                    : "Finn não conectado";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs",
        isBad ? "text-destructive" : "text-muted-foreground",
        className,
      )}
      role={isBad ? "status" : undefined}
    >
      <span
        className={cn(
          "font-medium",
          isBad ? "text-destructive" : "text-primary",
        )}
        aria-hidden
      >
        {isBad ? "!" : "✦"}
      </span>
      <span className={isBad ? "font-semibold" : undefined}>{label}</span>
      <span className="rounded-full border border-border/50 px-2 py-0.5">
        Local
      </span>
      <span className="text-muted-foreground/80">Runtime</span>
    </div>
  );
}
