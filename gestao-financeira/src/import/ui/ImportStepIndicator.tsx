"use client";

import { cn } from "@/lib/utils";
import type { ImportVisualStep } from "@/import/types";

const STEPS: { id: ImportVisualStep; label: string }[] = [
  { id: "document", label: "Documento" },
  { id: "analysis", label: "Análise" },
  { id: "review", label: "Revisão" },
  { id: "confirm", label: "Confirmar" },
  { id: "done", label: "Concluído" },
];

export function ImportStepIndicator({
  current,
}: {
  current: ImportVisualStep;
}) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol
      className="mb-8 flex flex-wrap items-center gap-2"
      aria-label="Etapas da importação"
    >
      {STEPS.map((step, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {i > 0 ? (
              <span
                className="hidden h-px w-6 bg-border sm:block"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "flex items-center gap-1.5 text-sm",
                active && "font-medium text-primary",
                done && "text-muted-foreground",
                !active && !done && "text-muted-foreground/70",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-primary/15 text-primary",
                  !active && !done && "border border-border",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : i + 1}
              </span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
