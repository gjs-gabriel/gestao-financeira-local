"use client";

import Link from "next/link";
import {
  FREQUENCY_LABELS,
  formatBrl,
  monthlySubscriptionTotal,
  normalizeToMonthly,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui-helpers";
import { cn } from "@/lib/utils";

export function AssinaturasPage() {
  const { snapshot } = useVault();
  if (!snapshot) return null;

  const rules = (snapshot.recurringRules ?? []).filter(
    (r) => r.active && r.kind === "expense",
  );
  const list =
    rules.length > 0
      ? rules.map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          frequency: r.frequency,
          categoryId: r.categoryId,
          monthly: normalizeToMonthly(r.amount, r.frequency),
        }))
      : snapshot.recurringExpenses.map((e) => ({
          id: e.id,
          name: e.name,
          amount: e.amount,
          frequency: e.frequency,
          categoryId: e.categoryId,
          monthly: normalizeToMonthly(e.amount, e.frequency),
        }));

  const total = monthlySubscriptionTotal(snapshot);

  return (
    <div>
      <PageHeader
        title="Assinaturas"
        description="Despesas recorrentes e total mensal estimado."
        action={
          <Link href="/gastos" className={cn(buttonVariants({ variant: "outline" }))}>
            Gerenciar em Gastos
          </Link>
        }
      />

      <div className="mb-6 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
        <p className="text-xs uppercase text-muted-foreground">Total mensal estimado</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">
          {formatBrl(total.monthly)}
        </p>
        <p className="text-sm text-muted-foreground">{total.count} assinatura(s)</p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Nenhuma recorrência"
          description="Cadastre gastos recorrentes (Netflix, aluguel, etc.)."
        />
      ) : (
        <ul className="space-y-2">
          {list
            .sort((a, b) => b.monthly - a.monthly)
            .map((item) => {
              const cat =
                snapshot.categories.find((c) => c.id === item.categoryId)
                  ?.name ?? "Sem categoria";
              return (
                <li
                  key={item.id}
                  className="flex justify-between gap-3 rounded-xl border border-border/50 px-4 py-3 text-sm"
                >
                  <span>
                    {item.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {FREQUENCY_LABELS[item.frequency]} · {cat}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatBrl(item.amount)}
                    <span className="text-muted-foreground">
                      {" "}
                      (~{formatBrl(item.monthly)}/mês)
                    </span>
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
