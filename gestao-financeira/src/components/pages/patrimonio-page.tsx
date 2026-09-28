"use client";

import {
  formatBrl,
  wealthBreakdown,
  wealthHistorySeries,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { EmptyState, Money, PageHeader } from "@/components/ui-helpers";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function brlTick(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function PatrimonioPage() {
  const { snapshot } = useVault();
  if (!snapshot) return null;

  const w = wealthBreakdown(snapshot);
  const series = wealthHistorySeries(snapshot).map((p) => ({
    label: p.periodKey,
    patrimonio: p.netWorth,
    ativos: p.assets,
    passivos: p.liabilities,
  }));

  return (
    <div>
      <PageHeader
        title="Patrimônio"
        description="Ativos − passivos. Transferências e aportes não inventam receita/despesa."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
          <p className="text-xs uppercase text-muted-foreground">Ativos</p>
          <p className="font-heading text-xl font-semibold">
            <Money value={w.assets} />
          </p>
          <p className="text-xs text-muted-foreground">
            Contas {formatBrl(w.accounts)} · aplicações {formatBrl(w.investments)}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
          <p className="text-xs uppercase text-muted-foreground">Passivos</p>
          <p className="font-heading text-xl font-semibold tabular-nums">
            {formatBrl(w.liabilities)}
          </p>
          <p className="text-xs text-muted-foreground">
            Faturas {formatBrl(w.invoices)} · dívidas {formatBrl(w.debts)}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
          <p className="text-xs uppercase text-muted-foreground">Patrimônio líquido</p>
          <p className="font-heading text-xl font-semibold">
            <Money value={w.netWorth} />
          </p>
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-border/60 bg-card/40 p-4">
        <h2 className="mb-3 font-heading text-lg font-medium">Evolução</h2>
        {series.length === 0 ? (
          <EmptyState
            title="Sem histórico ainda"
            description="O ponto do mês é registrado ao desbloquear o cofre."
          />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={brlTick} width={72} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? formatBrl(v) : String(v ?? "")
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="patrimonio"
                  name="Patrimônio"
                  stroke="#0F766E"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="ativos"
                  name="Ativos"
                  stroke="#1D4ED8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="passivos"
                  name="Passivos"
                  stroke="#B45309"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
