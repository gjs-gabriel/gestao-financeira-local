"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  buildAnnualReport,
  buildMonthReport,
  categoryTrendChart,
  detectAnomalies,
  formatBrl,
  listYearsAround,
  projectedBalanceSeries,
  projectedCashflow,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import {
  CAT_COLORS,
  CHART_BRAND,
  CHART_EXPENSE,
  CHART_INCOME,
  CHART_STROKE,
  ChartGradient,
  ChartGrid,
  GlassChartTooltip,
  brlTick,
  chartAxisTick,
  tooltipBrl,
} from "@/components/charts/money-chart";
import { Money, PageHeader } from "@/components/ui-helpers";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function RelatoriosPage() {
  const { snapshot } = useVault();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [horizon, setHorizon] = useState<3 | 6 | 12>(6);
  const [highlight, setHighlight] = useState<string | null>(null);
  const years = useMemo(() => listYearsAround(now.getFullYear(), 2), [now]);

  if (!snapshot) return null;

  const report = buildMonthReport(snapshot, year, month);
  const annual = buildAnnualReport(snapshot, year);
  const projection = projectedCashflow(snapshot, year, month, horizon, now);
  const trend = categoryTrendChart(snapshot, year, month, 12, 5);
  const trendRows = trend.points.map((point) => ({
    key: point.key,
    label: point.label,
    ...point.values,
  }));
  const balanceSeries = projectedBalanceSeries(projection);
  const anomalyIds = new Set(detectAnomalies(snapshot, now).map((item) => item.id));
  const chartCategoryIds = new Set(trend.series.map((series) => series.categoryId));

  const yearChart = annual.months.map((m) => ({
    label: m.label.slice(0, 3),
    entradas: m.income,
    saidas: m.totalExpenses,
    saldo: m.surplus,
  }));

  const quarters = [0, 1, 2, 3].map((q) => {
    const slice = annual.months.slice(q * 3, q * 3 + 3);
    const income = slice.reduce((s, m) => s + m.income, 0);
    const expenses = slice.reduce((s, m) => s + m.totalExpenses, 0);
    const surplus = income - expenses;
    return {
      key: `Q${q + 1}`,
      label: `Consolidado Trimestre ${q + 1} (Q${q + 1})`,
      income,
      expenses,
      surplus,
      status: surplus >= 0 ? "Em Conformidade" : "Atenção Orçamentária",
    };
  });

  return (
    <div>
      <PageHeader
        title="Fluxo & Relatórios"
        description="Visão integrada de distribuição de saídas, projeção de metas e compliance anual."
        action={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-border bg-white px-3.5 py-1.5 text-xs font-semibold text-foreground">
              Ano de {year}
            </span>
            <span className="rounded-md border border-border bg-white px-3.5 py-1.5 text-xs font-semibold text-foreground">
              Consolidado
            </span>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Mês</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => v && setMonth(Number(v))}
          >
            <SelectTrigger className="h-8 w-28 rounded-lg">
              <SelectValue>
                {(v: string | null) => (v ? MONTHS[Number(v) - 1] : "")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ano</Label>
          <Select
            value={String(year)}
            onValueChange={(v) => v && setYear(Number(v))}
          >
            <SelectTrigger className="h-8 w-24 rounded-lg">
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

      <Tabs defaultValue="mes">
        <TabsList className="mb-4">
          <TabsTrigger value="mes">Mês</TabsTrigger>
          <TabsTrigger value="ano">Ano</TabsTrigger>
          <TabsTrigger value="projecao">Projeção</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="space-y-6">
          <p className="font-heading text-lg capitalize">{report.label}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Entradas" value={report.cashflow?.income ?? 0} />
            <Stat label="Saídas" value={report.cashflow?.totalExpenses ?? 0} />
            <Stat label="Saldo" value={report.cashflow?.surplus ?? 0} signed />
            <Stat label="PL atual" value={report.wealth.netWorth} signed />
          </div>

          <Block title="Gastos por categoria">
            {trend.series.length > 0 ? (
              <div className="mb-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Trajetória das cinco categorias que mais pesam, até este mês.
                  Clique numa categoria da lista para destacar a linha.
                </p>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendRows} margin={{ left: 4, right: 4 }}>
                      <defs>
                        {trend.series.map((series, index) => (
                          <ChartGradient
                            key={series.categoryId}
                            id={`rep-cat-${series.categoryId}`}
                            color={CAT_COLORS[index % CAT_COLORS.length]!}
                          />
                        ))}
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
                        tickFormatter={brlTick}
                        width={68}
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                      />
                      <Tooltip
                        content={<GlassChartTooltip formatter={tooltipBrl} />}
                      />
                      <Legend />
                      {trend.series.map((series, index) => {
                        const marked = anomalyIds.has(`cat-${series.categoryId}`);
                        const dimmed =
                          highlight !== null && highlight !== series.categoryId;
                        const color = CAT_COLORS[index % CAT_COLORS.length]!;
                        return (
                          <Area
                            key={series.categoryId}
                            type="monotone"
                            dataKey={series.categoryId}
                            name={series.categoryName}
                            stroke={color}
                            fill={`url(#rep-cat-${series.categoryId})`}
                            strokeWidth={CHART_STROKE}
                            strokeOpacity={dimmed ? 0.18 : 1}
                            fillOpacity={dimmed ? 0.15 : 1}
                            activeDot={
                              marked
                                ? { r: 5, strokeWidth: 0, fill: color }
                                : { r: 3, strokeWidth: 0 }
                            }
                            connectNulls={false}
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
            {report.categories.length === 0 ? (
              <Empty hint="Sem gastos no mês." />
            ) : (
              <ul className="space-y-1 text-sm">
                {report.categories.map((c) => {
                  const active = highlight === c.categoryId;
                  const inChart = chartCategoryIds.has(c.categoryId);
                  return (
                    <li key={c.categoryId} className="flex justify-between gap-3">
                      {inChart ? (
                        <button
                          type="button"
                          className={`text-left ${active ? "font-medium underline" : ""}`}
                          onClick={() =>
                            setHighlight((current) =>
                              current === c.categoryId ? null : c.categoryId,
                            )
                          }
                        >
                          {c.categoryName}
                        </button>
                      ) : (
                        <span>{c.categoryName}</span>
                      )}
                      <span className="tabular-nums">{formatBrl(c.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block title="Gastos por instituição">
            {report.byInstitution.length === 0 ? (
              <Empty hint="Sem gastos com instituição." />
            ) : (
              <ul className="space-y-1 text-sm">
                {report.byInstitution.map((row) => (
                  <li key={row.name} className="flex justify-between gap-3">
                    <span>{row.name}</span>
                    <span className="tabular-nums">{formatBrl(row.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <div className="grid gap-6 lg:grid-cols-2">
            <Block title="Assinaturas (mensal est.)">
              <p className="text-sm">
                {report.subscriptions.count} · {formatBrl(report.subscriptions.monthly)}
              </p>
            </Block>
            <Block title="Faturas abertas">
              {report.openInvoices.length === 0 ? (
                <Empty hint="Nenhuma." />
              ) : (
                <ul className="space-y-1 text-sm">
                  {report.openInvoices.map((inv) => (
                    <li key={inv.id} className="flex justify-between gap-3">
                      <span>
                        {inv.card} · {inv.dueDate}
                      </span>
                      <span className="tabular-nums">{formatBrl(inv.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </div>
        </TabsContent>

        <TabsContent value="ano" className="space-y-6">
          <h2 className="font-heading border-b border-border pb-2 text-[22px] font-extrabold tracking-tight">
            Relatórios Consolidados de Tendência
          </h2>

          <div className="glass-surface card-premium-hover rounded-2xl p-6">
            <p className="type-label mb-3">
              Tendência combinada de caixa (linhas de fluxo avançadas)
            </p>
            <Money
              value={annual.totals.income}
              display
              className="mb-6 text-[34px]"
            />
            <div className="h-48 w-full md:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={yearChart} margin={{ left: 4, right: 4 }}>
                  <defs>
                    <ChartGradient id="rep-ano-in" color={CHART_INCOME} />
                    <ChartGradient id="rep-ano-out" color={CHART_EXPENSE} />
                  </defs>
                  <ChartGrid />
                  <XAxis
                    dataKey="label"
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={64}
                    tick={chartAxisTick}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={<GlassChartTooltip formatter={tooltipBrl} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke={CHART_INCOME}
                    fill="url(#rep-ano-in)"
                    strokeWidth={3}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke={CHART_EXPENSE}
                    fill="url(#rep-ano-out)"
                    strokeWidth={2.5}
                    strokeDasharray="2 2"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-foreground/5 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-normal">Período histórico</th>
                    <th className="px-2 py-2 font-normal">Total entradas</th>
                    <th className="px-2 py-2 font-normal">Total saídas</th>
                    <th className="px-2 py-2 font-normal">Balanço líquido</th>
                    <th className="px-2 py-2 font-normal">Status regulatório</th>
                  </tr>
                </thead>
                <tbody className="font-medium">
                  {quarters.map((q) => (
                    <tr
                      key={q.key}
                      className="border-b border-foreground/[0.03]"
                    >
                      <td className="px-2 py-2.5">{q.label}</td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {formatBrl(q.income)}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {formatBrl(q.expenses)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 tabular-nums",
                          q.surplus >= 0 ? "text-income" : "text-debt",
                        )}
                      >
                        {q.surplus >= 0 ? "+" : ""}
                        {formatBrl(q.surplus)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5",
                          q.surplus < 0 && "text-debt",
                        )}
                      >
                        {q.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Entradas ${year}`} value={annual.totals.income} />
            <Stat label="Saídas" value={annual.totals.totalExpenses} />
            <Stat label="Saldo" value={annual.totals.surplus} signed />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead>
                <tr className="border-b border-foreground/5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-normal">Mês</th>
                  <th className="px-2 py-2 font-normal">Entradas</th>
                  <th className="px-2 py-2 font-normal">Saídas</th>
                  <th className="px-2 py-2 font-normal">Saldo</th>
                </tr>
              </thead>
              <tbody className="text-[13px] font-medium">
                {annual.months.map((m) => (
                  <tr key={m.key} className="border-b border-foreground/[0.03]">
                    <td className="px-2 py-2.5 capitalize">{m.label}</td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {formatBrl(m.income)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {formatBrl(m.totalExpenses)}
                    </td>
                    <td className="px-2 py-2.5">
                      <Money value={m.surplus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="projecao" className="space-y-4">
          <div className="space-y-1.5">
            <Label>Horizonte</Label>
            <Select
              value={String(horizon)}
              onValueChange={(v) => {
                if (v === "3" || v === "6" || v === "12") {
                  setHorizon(Number(v) as 3 | 6 | 12);
                }
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue>
                  {(v: string | null) => (v ? `${v} meses` : "")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Considera rendas/gastos recorrentes, parcelas, faturas e lançamentos
            datados. Meses futuros = previsto.
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceSeries} margin={{ left: 4, right: 4 }}>
                <defs>
                  <ChartGradient id="rep-realizado" color={CHART_BRAND} />
                  <ChartGradient id="rep-previsto" color={CHART_BRAND} />
                </defs>
                <ChartGrid />
                <XAxis
                  dataKey="label"
                  tick={chartAxisTick}
                  tickLine={false}
                  axisLine={false}
                  interval={horizon > 6 ? 1 : 0}
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
                  dataKey="realizado"
                  name="Realizado"
                  stroke={CHART_BRAND}
                  fill="url(#rep-realizado)"
                  strokeWidth={CHART_STROKE}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="previsto"
                  name="Previsto"
                  stroke={CHART_BRAND}
                  fill="url(#rep-previsto)"
                  strokeWidth={CHART_STROKE}
                  strokeDasharray="4 4"
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="surface-panel overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Mês</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Entradas</th>
                  <th className="px-3 py-2">Saídas</th>
                  <th className="px-3 py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((p) => (
                  <tr key={p.key} className="surface-panel px-4">
                    <td className="px-3 py-2 capitalize">{p.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.projected ? "previsto" : "realizado"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatBrl(p.income)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatBrl(p.expenses)}</td>
                    <td className="px-3 py-2">
                      <Money value={p.surplus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  label,
  value,
  signed,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  return (
    <div className="glass-surface rounded-2xl px-4 py-3">
      <p className="type-label">{label}</p>
      <p className="type-metric mt-1.5 text-lg">
        {signed ? <Money value={value} /> : formatBrl(value)}
      </p>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-surface card-premium-hover rounded-2xl p-5">
      <h2 className="type-label mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ hint }: { hint: string }) {
  return <p className="text-sm text-muted-foreground">{hint}</p>;
}
