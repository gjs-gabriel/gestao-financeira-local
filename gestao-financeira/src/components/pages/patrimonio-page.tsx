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
  CHART_BRAND,
  CHART_DEBT,
  CHART_INCOME,
  CHART_STROKE,
  ChartGradient,
  ChartGrid,
  GlassChartTooltip,
  brlTick,
  chartAxisTick,
  tooltipBrl,
} from "@/components/charts/money-chart";
import {
  EmptyState,
  Metric,
  Money,
  PageHeader,
  Section,
  StatGroup,
} from "@/components/ui-helpers";
import { GlowCard } from "@/components/ui/glow-card";
import {
  Area,
  AreaChart,
  Legend,
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
        <GlowCard className="max-w-xl">
          <p className="type-label">Patrimônio líquido</p>
          <Money
            value={w.netWorth}
            display
            className="mt-2 text-4xl md:text-5xl"
          />
        </GlowCard>
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
        className="surface-panel px-4"
      >
        {series.length < 2 ? (
          <EmptyState
            title="Histórico ainda curto"
            description="Continue usando o aplicativo: o patrimônio mensal é registrado e a curva aparece aqui."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 4, right: 4 }}>
                <defs>
                  <ChartGradient id="pat-ativos" color={CHART_INCOME} />
                  <ChartGradient id="pat-passivos" color={CHART_DEBT} />
                  <ChartGradient id="pat-pl" color={CHART_BRAND} />
                </defs>
                <ChartGrid />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <Tooltip content={<GlassChartTooltip formatter={tooltipBrl} />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="ativos"
                  name="Ativos"
                  stroke={CHART_INCOME}
                  fill="url(#pat-ativos)"
                  strokeWidth={CHART_STROKE}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="passivos"
                  name="Passivos"
                  stroke={CHART_DEBT}
                  fill="url(#pat-passivos)"
                  strokeWidth={CHART_STROKE}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="pl"
                  name="Patrimônio líquido"
                  stroke={CHART_BRAND}
                  fill="url(#pat-pl)"
                  strokeWidth={CHART_STROKE}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {positions.series.length > 0 ? (
        <Section
          title="Como as posições evoluíram?"
          hint="Aplicações com pelo menos dois registros no histórico importado"
          className="surface-panel px-4"
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={positionRows} margin={{ left: 4, right: 4 }}>
                <defs>
                  {positions.series.map((item, index) => (
                    <ChartGradient
                      key={item.investmentId}
                      id={`pos-${item.investmentId}`}
                      color={CAT_COLORS[index % CAT_COLORS.length]!}
                    />
                  ))}
                </defs>
                <ChartGrid />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <Tooltip content={<GlassChartTooltip formatter={tooltipBrl} />} />
                <Legend />
                {positions.series.map((item, index) => {
                  const color = CAT_COLORS[index % CAT_COLORS.length]!;
                  return (
                    <Area
                      key={item.investmentId}
                      type="monotone"
                      dataKey={item.investmentId}
                      name={item.name}
                      stroke={color}
                      fill={`url(#pos-${item.investmentId})`}
                      strokeWidth={CHART_STROKE}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                      connectNulls={false}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
