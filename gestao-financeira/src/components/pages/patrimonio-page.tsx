"use client";

import {
  formatBrl,
  wealthBreakdown,
  wealthHistorySeries,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import {
  EmptyState,
  Metric,
  Money,
  PageHeader,
  Section,
  StatGroup,
} from "@/components/ui-helpers";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BLUE = "oklch(0.48 0.1 250)";

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
    label: p.periodKey.slice(5),
    patrimonio: p.netWorth,
    ativos: p.assets,
    passivos: p.liabilities,
  }));

  return (
    <div>
      <PageHeader
        title="Patrimônio"
        description="Ativos menos passivos — a visão do que você construiu."
      />

      <Section className="border-t border-border/40 pt-8">
        <p className="type-label">Patrimônio líquido</p>
        <p className="type-display mt-2 text-4xl text-investment md:text-5xl">
          {formatBrl(w.netWorth)}
        </p>
        <StatGroup className="mt-8 lg:grid-cols-3">
          <Metric
            label="Ativos"
            value={formatBrl(w.assets)}
            tone="investment"
            hint={`Contas ${formatBrl(w.accounts)} · Aplicações ${formatBrl(w.investments)}`}
          />
          <Metric
            label="Passivos"
            value={formatBrl(w.liabilities)}
            tone="debt"
            hint={`Dívidas ${formatBrl(w.debts)} · Faturas ${formatBrl(w.invoices)}`}
          />
          <Metric
            label="Saldo líquido"
            value={<Money value={w.netWorth} />}
            hint="Ativos − passivos"
          />
        </StatGroup>
      </Section>

      <Section
        title="Estou construindo patrimônio?"
        hint="Evolução registrada ao usar o cofre"
        className="border-t border-border/40"
      >
        {series.length < 2 ? (
          <EmptyState
            title="Histórico ainda curto"
            description="Continue usando o aplicativo: o patrimônio mensal é registrado e a curva aparece aqui."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="patFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.02 170)" }}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "oklch(0.5 0.02 170)" }}
                />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number"
                      ? v.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : String(v)
                  }
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid oklch(0.9 0.015 165)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="patrimonio"
                  name="PL"
                  stroke={BLUE}
                  fill="url(#patFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>
    </div>
  );
}
