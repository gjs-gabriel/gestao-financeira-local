"use client";

import {
  formatBrl,
  positionHistoryChart,
  wealthBreakdown,
  wealthChartSeries,
  wealthHistorySeries,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import {
  CAT_COLORS,
  CHART_AMBER,
  CHART_BLUE,
  CHART_TEAL,
  brlTick,
  chartTooltipStyle,
  monthAxisTick,
  tooltipBrl,
  valueAxisTick,
} from "@/components/charts/money-chart";
import {
  EmptyState,
  Metric,
  Money,
  PageHeader,
  Section,
  StatGroup,
} from "@/components/ui-helpers";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function PatrimonioPage() {
  const { snapshot } = useVault();
  if (!snapshot) return null;

  const w = wealthBreakdown(snapshot);
  const series = wealthChartSeries(wealthHistorySeries(snapshot));
  const positions = positionHistoryChart(
    snapshot.investmentPositionHistory ?? [],
    new Map(snapshot.investments.map((item) => [item.id, item.name])),
  );
  const positionRows = positions.points.map((point) => ({
    label: `${point.date.slice(8, 10)}/${point.date.slice(5, 7)}`,
    ...point.values,
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
              <LineChart data={series} margin={{ left: 4, right: 4 }}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={monthAxisTick}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tick={valueAxisTick}
                />
                <Tooltip formatter={tooltipBrl} contentStyle={chartTooltipStyle} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ativos"
                  name="Ativos"
                  stroke={CHART_TEAL}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="passivos"
                  name="Passivos"
                  stroke={CHART_AMBER}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="pl"
                  name="Patrimônio líquido"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {positions.series.length > 0 ? (
        <Section
          title="Como as posições evoluíram?"
          hint="Aplicações com pelo menos dois registros no histórico importado"
          className="border-t border-border/40"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={positionRows} margin={{ left: 4, right: 4 }}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={monthAxisTick}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tick={valueAxisTick}
                />
                <Tooltip formatter={tooltipBrl} contentStyle={chartTooltipStyle} />
                <Legend />
                {positions.series.map((item, index) => (
                  <Line
                    key={item.investmentId}
                    type="monotone"
                    dataKey={item.investmentId}
                    name={item.name}
                    stroke={CAT_COLORS[index % CAT_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
