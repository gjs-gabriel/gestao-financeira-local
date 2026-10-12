"use client";

import { computeAlerts } from "@/domain";
import { useVault } from "@/lib/vault-context";
import { EmptyState, PageHeader } from "@/components/ui-helpers";

export function AlertasPage() {
  const { snapshot } = useVault();
  if (!snapshot) return null;

  const alerts = computeAlerts(snapshot);

  return (
    <div>
      <PageHeader
        title="Alertas"
        description="Avisos locais com base em orçamentos, faturas, metas e projeção."
      />

      {alerts.length === 0 ? (
        <EmptyState
          title="Tudo tranquilo"
          description="Nenhum alerta no momento. Orçamentos, faturas e metas alimentam esta lista."
        />
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => {
            const border =
              alert.severity === "critical"
                ? "border-debt/40"
                : alert.severity === "warning"
                  ? "border-expense/40"
                  : "border-border/60";
            return (
              <li
                key={alert.id}
                className={`surface-panel px-4 py-3 ${border}`}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {alert.severity === "critical"
                    ? "Crítico"
                    : alert.severity === "warning"
                      ? "Atenção"
                      : "Info"}
                </p>
                <p className="font-medium">{alert.title}</p>
                <p className="text-sm text-muted-foreground">{alert.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
