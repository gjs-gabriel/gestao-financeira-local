"use client";

import { useMemo, useState } from "react";
import {
  annualCashflow,
  cashflowLastMonths,
  commitmentSplit,
  expenseCompositionSeries,
  formatBrl,
  futureInstallmentSeries,
  listYearsAround,
  monthlyCashflowDetailed,
  monthLabel,
  savingsRateSeries,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import {
  CHART_BAR_CLASS,
  CHART_BAR_GAP,
  CHART_BAR_RADIUS_TOP,
  CHART_BAR_SIZE,
  CHART_BRAND,
  CHART_DEBT,
  CHART_EXPENSE,
  CHART_INCOME,
  CHART_INVEST,
  CHART_STROKE,
  ChartGradient,
  ChartGrid,
  GlassChartTooltip,
  brlTick,
  chartAxisTick,
  percentDomain,
  tooltipBrl,
  tooltipPercent,
} from "@/components/charts/money-chart";
import { EmptyState, Money, Metric, PageHeader, StatGroup } from "@/components/ui-helpers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function FluxoPage() {
  const { snapshot } = useVault();
  const now = new Date();
  const [tab, setTab] = useState("mensal");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const years = useMemo(
    () => listYearsAround(now.getFullYear(), 3),
    [now],
  );

  if (!snapshot) return null;

  const monthDetail = monthlyCashflowDetailed(snapshot, year, month);
  const last12 = cashflowLastMonths(snapshot, year, month, 12);
  const annual = annualCashflow(snapshot, year);

  const hasActivity =
    snapshot.incomes.length > 0 ||
    snapshot.oneTimeIncomes.length > 0 ||
    snapshot.recurringExpenses.length > 0 ||
    snapshot.oneTimeExpenses.length > 0 ||
    (snapshot.installmentExpenses ?? []).length > 0;

  const chart12 = last12.map((p) => {
    const split = commitmentSplit(p.income, p.totalExpenses);
    return {
      label: p.label,
      entradas: Math.round(p.income * 100) / 100,
      ...split,
    };
  });

  const chartYear = annual.months.map((p) => ({
    label: p.label.split("/")[0],
    entradas: Math.round(p.income * 100) / 100,
    saidas: Math.round(p.totalExpenses * 100) / 100,
    saldo: Math.round(p.surplus * 100) / 100,
  }));

  const composition = expenseCompositionSeries(last12);
  const savings = savingsRateSeries(last12);
  const installmentsAhead = futureInstallmentSeries(snapshot, year, month, 12);

  return (
    <div>
      <PageHeader
        title="Fluxo & Relatórios"
        description="Visão integrada de distribuição de saídas, projeção de metas e compliance anual."
      />

      {!hasActivity ? (
        <EmptyState
          title="Ainda não há movimento"
          description="Cadastre rendas e gastos — ou importe um extrato — para ver como o dinheiro se comporta."
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList className="mb-4">
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
          <TabsTrigger value="anual">Anual</TabsTrigger>
        </TabsList>

        <TabsContent value="mensal" className="space-y-8">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => {
                  if (!v) return;
                  setMonth(Number(v));
                }}
              >
                <SelectTrigger className="h-8 w-36 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {monthLabel(year, m).split("/")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ano</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => {
                  if (!v) return;
                  setYear(Number(v));
                }}
              >
                <SelectTrigger className="h-8 w-28 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="type-label capitalize">{monthLabel(year, month)}</p>
            <StatGroup className="mt-4 lg:grid-cols-4">
              <Metric
                label="Entradas"
                value={<Money value={monthDetail.income} />}
                tone="income"
              />
              <Metric
                label="Saídas"
                value={<Money value={monthDetail.totalExpenses} />}
                tone="expense"
              />
              <Metric
                label="Saldo"
                value={<Money value={monthDetail.surplus} />}
              />
              <Metric
                label="Pontuais"
                value={<Money value={monthDetail.oneTimeExpenses} />}
                tone="expense"
              />
            </StatGroup>
          </div>

          <ul className="space-y-2 border-t border-border/40 pt-4 text-sm">
            <Row label="Rendas recorrentes" value={monthDetail.recurringIncome} />
            <Row label="Rendas pontuais" value={monthDetail.oneTimeIncome} />
            <Row
              label="Gastos recorrentes"
              value={-monthDetail.recurringExpenses}
            />
            <Row
              label="Gastos pontuais"
              value={-monthDetail.oneTimeExpenses}
            />
            <Row
              label="Parcelas"
              value={-monthDetail.installmentExpenses}
            />
          </ul>

          <section className="border-t border-border/40 pt-6">
            <h2 className="text-base font-medium">
              Meu dinheiro está aumentando ou diminuindo?
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Últimos 12 meses — cada barra mostra a receita e quanto dela foi
              comprometida.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chart12}
                  margin={{ left: 4, right: 4 }}
                  barSize={CHART_BAR_SIZE}
                  barGap={CHART_BAR_GAP}
                >
                  <ChartGrid />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={64}
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={
                      <GlassChartTooltip
                        formatter={(value, _name, item) => {
                          const amount = typeof value === "number" ? value : 0;
                          const payload = item.payload as
                            | { entradas?: number }
                            | undefined;
                          const income = Number(payload?.entradas ?? 0);
                          const money = tooltipBrl(amount);
                          if (income <= 0) return money;
                          const pct = Math.round((amount / income) * 100);
                          return `${money} (${pct}% da receita)`;
                        }}
                      />
                    }
                    cursor={{ fill: "oklch(from var(--muted) l c h / 0.35)" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="comprometido"
                    name="Gasto"
                    stackId="fluxo"
                    fill={CHART_EXPENSE}
                    className={CHART_BAR_CLASS}
                  />
                  <Bar
                    dataKey="disponivel"
                    name="Disponível"
                    stackId="fluxo"
                    fill={CHART_INCOME}
                    className={CHART_BAR_CLASS}
                  />
                  <Bar
                    dataKey="acima"
                    name="Acima da receita"
                    stackId="fluxo"
                    fill={CHART_DEBT}
                    radius={CHART_BAR_RADIUS_TOP}
                    className={CHART_BAR_CLASS}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="border-t border-border/40 pt-6">
            <h2 className="text-base font-medium">De que tipo são as saídas?</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Últimos 12 meses — recorrente, pontual (inclui cartão) e parcelas.
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={composition}
                  margin={{ left: 4, right: 4 }}
                  barSize={CHART_BAR_SIZE}
                  barGap={CHART_BAR_GAP}
                >
                  <ChartGrid />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={68}
                    tickLine={false}
                    axisLine={false}
                    tick={chartAxisTick}
                  />
                  <Tooltip
                    content={<GlassChartTooltip formatter={tooltipBrl} />}
                    cursor={{ fill: "oklch(from var(--muted) l c h / 0.35)" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="recorrente"
                    name="Recorrente"
                    stackId="tipo"
                    fill={CHART_EXPENSE}
                    className={CHART_BAR_CLASS}
                  />
                  <Bar
                    dataKey="pontual"
                    name="Pontual"
                    stackId="tipo"
                    fill={CHART_BRAND}
                    className={CHART_BAR_CLASS}
                  />
                  <Bar
                    dataKey="parcelas"
                    name="Parcelas"
                    stackId="tipo"
                    fill={CHART_INVEST}
                    radius={CHART_BAR_RADIUS_TOP}
                    className={CHART_BAR_CLASS}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="border-t border-border/40 pt-6">
            <h2 className="text-base font-medium">Quanto da entrada sobrou?</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Saldo dividido pela entrada do mês. Meses sem entrada ficam sem ponto.
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={savings} margin={{ left: 4, right: 4 }}>
                  <defs>
                    <ChartGradient id="fluxo-sobra" color={CHART_INCOME} />
                  </defs>
                  <ChartGrid />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={(value: number) => `${value}%`}
                    width={48}
                    tickLine={false}
                    axisLine={false}
                    tick={chartAxisTick}
                    domain={percentDomain}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="oklch(from var(--border) l c h / 0.55)"
                    strokeDasharray="4 6"
                  />
                  <Tooltip
                    content={<GlassChartTooltip formatter={tooltipPercent} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="taxa"
                    name="Sobra"
                    stroke={CHART_INCOME}
                    fill="url(#fluxo-sobra)"
                    strokeWidth={CHART_STROKE}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="border-t border-border/40 pt-6">
            <h2 className="text-base font-medium">Quando as parcelas aliviam?</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Carga de parcelas nos 12 meses a partir de {monthLabel(year, month)}.
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={installmentsAhead}
                  margin={{ left: 4, right: 4 }}
                  barSize={CHART_BAR_SIZE}
                  barGap={CHART_BAR_GAP}
                >
                  <ChartGrid />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={68}
                    tickLine={false}
                    axisLine={false}
                    tick={chartAxisTick}
                  />
                  <Tooltip
                    content={<GlassChartTooltip formatter={tooltipBrl} />}
                    cursor={{ fill: "oklch(from var(--muted) l c h / 0.35)" }}
                  />
                  <Bar
                    dataKey="parcelas"
                    name="Parcelas"
                    fill={CHART_EXPENSE}
                    radius={CHART_BAR_RADIUS_TOP}
                    className={CHART_BAR_CLASS}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="anual" className="space-y-8">
          <div className="space-y-1">
            <Label className="text-xs">Ano</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => {
                if (!v) return;
                setYear(Number(v));
              }}
            >
              <SelectTrigger className="h-8 w-28 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <StatGroup className="lg:grid-cols-3">
            <Metric
              label={`Entradas ${year}`}
              value={<Money value={annual.totals.income} />}
              tone="income"
            />
            <Metric
              label={`Saídas ${year}`}
              value={<Money value={annual.totals.totalExpenses} />}
              tone="expense"
            />
            <Metric
              label={`Saldo ${year}`}
              value={<Money value={annual.totals.surplus} />}
            />
          </StatGroup>

          <h2 className="font-heading border-b border-border pb-2 text-[22px] font-extrabold tracking-tight">
            Relatórios Consolidados de Tendência
          </h2>

          <div className="glass-surface card-premium-hover rounded-2xl p-6">
            <p className="type-label mb-3">
              Tendência combinada de caixa · {year}
            </p>
            <Money
              value={annual.totals.income}
              display
              className="mb-6 text-[34px]"
            />
            <div className="h-52 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartYear} margin={{ left: 4, right: 4 }}>
                  <defs>
                    <ChartGradient id="fluxo-entradas" color={CHART_INCOME} />
                    <ChartGradient id="fluxo-saidas" color={CHART_EXPENSE} />
                    <ChartGradient id="fluxo-saldo" color={CHART_BRAND} />
                  </defs>
                  <ChartGrid />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={64}
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<GlassChartTooltip formatter={tooltipBrl} />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke={CHART_INCOME}
                    fill="url(#fluxo-entradas)"
                    strokeWidth={3}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke={CHART_EXPENSE}
                    fill="url(#fluxo-saidas)"
                    strokeWidth={2.5}
                    strokeDasharray="2 2"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    name="Saldo"
                    stroke={CHART_BRAND}
                    fill="url(#fluxo-saldo)"
                    strokeWidth={CHART_STROKE}
                    strokeDasharray="4 4"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-foreground/5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-normal">Mês</th>
                    <th className="px-2 py-2 font-normal">Entradas</th>
                    <th className="px-2 py-2 font-normal">Saídas</th>
                    <th className="px-2 py-2 font-normal">Balanço líquido</th>
                    <th className="px-2 py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="text-[13px] font-medium">
                  {annual.months.map((m) => (
                    <tr
                      key={m.key}
                      className="border-b border-foreground/[0.03]"
                    >
                      <td className="px-2 py-2.5 capitalize">{m.label}</td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {formatBrl(m.income)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {formatBrl(m.totalExpenses)}
                      </td>
                      <td
                        className={
                          m.surplus >= 0
                            ? "px-2 py-2.5 tabular-nums text-income"
                            : "px-2 py-2.5 tabular-nums text-debt"
                        }
                      >
                        {m.surplus >= 0 ? "+" : ""}
                        {formatBrl(m.surplus)}
                      </td>
                      <td
                        className={
                          m.surplus < 0
                            ? "px-2 py-2.5 text-debt"
                            : "px-2 py-2.5"
                        }
                      >
                        {m.surplus >= 0
                          ? "Em Conformidade"
                          : "Atenção Orçamentária"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <Money value={value} />
    </li>
  );
}
