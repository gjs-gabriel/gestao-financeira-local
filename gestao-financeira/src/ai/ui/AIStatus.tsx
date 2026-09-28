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
      ? "IA local ativa (runtime)"
      : status.status === "downloading"
        ? `Baixando modelo — ${Math.round(status.progress * 100)}%`
        : status.status === "loading"
          ? "Carregando modelo…"
          : status.status === "checking"
            ? "Verificando assistente local…"
            : status.status === "generating"
              ? "Analisando suas finanças…"
              : status.status === "unsupported"
                ? "Assistente local indisponível"
                : status.status === "disabled"
                  ? "IA local desativada"
                  : status.status === "error"
                    ? "Erro no assistente local"
                    : "Assistente local não conectado";

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
