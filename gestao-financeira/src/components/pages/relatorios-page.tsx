"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  buildAnnualReport,
  buildMonthReport,
  categoryTrendChart,
  detectAnomalies,
  formatBrl,
  listYearsAround,
  monthKey,
  projectedBalanceSeries,
  projectedCashflow,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import {
  CAT_COLORS,
  CHART_BLUE,
  brlTick,
  chartTooltipStyle,
  monthAxisTick,
  tooltipBrl,
  valueAxisTick,
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
import {
  Legend,
  Line,
  LineChart,
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
  const currentKey = monthKey(now.getFullYear(), now.getMonth() + 1);
  const chartCategoryIds = new Set(trend.series.map((series) => series.categoryId));

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Resumo do período, categorias, instituições e projeção."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => v && setMonth(Number(v))}
          >
            <SelectTrigger className="w-28">
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
          <Label>Ano</Label>
          <Select
            value={String(year)}
            onValueChange={(v) => v && setYear(Number(v))}
          >
            <SelectTrigger className="w-24">
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
                    <LineChart data={trendRows} margin={{ left: 4, right: 4 }}>
                      <XAxis
                        dataKey="label"
                        tick={monthAxisTick}
                        tickLine={false}
                        axisLine={false}
                        interval={1}
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
                      {trend.series.map((series, index) => {
                        const marked = anomalyIds.has(`cat-${series.categoryId}`);
                        const dimmed = highlight !== null && highlight !== series.categoryId;
                        return (
                          <Line
                            key={series.categoryId}
                            type="monotone"
                            dataKey={series.categoryId}
                            name={series.categoryName}
                            stroke={CAT_COLORS[index % CAT_COLORS.length]}
                            strokeWidth={2}
                            strokeOpacity={dimmed ? 0.18 : 1}
                            dot={
                              marked ? (
                                <MarkedDot markKey={currentKey} />
                              ) : (
                                false
                              )
                            }
                            connectNulls={false}
                          />
                        );
                      })}
                    </LineChart>
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

        <TabsContent value="ano" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Entradas ${year}`} value={annual.totals.income} />
            <Stat label="Saídas" value={annual.totals.totalExpenses} />
            <Stat label="Saldo" value={annual.totals.surplus} signed />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Mês</th>
                  <th className="px-3 py-2">Entradas</th>
                  <th className="px-3 py-2">Saídas</th>
                  <th className="px-3 py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {annual.months.map((m) => (
                  <tr key={m.key} className="border-t border-border/40">
                    <td className="px-3 py-2 capitalize">{m.label}</td>
                    <td className="px-3 py-2 tabular-nums">{formatBrl(m.income)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatBrl(m.totalExpenses)}
                    </td>
                    <td className="px-3 py-2">
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
              <LineChart data={balanceSeries} margin={{ left: 4, right: 4 }}>
                <XAxis
                  dataKey="label"
                  tick={monthAxisTick}
                  tickLine={false}
                  axisLine={false}
                  interval={horizon > 6 ? 1 : 0}
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
                  dataKey="realizado"
                  name="Realizado"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="previsto"
                  name="Previsto"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
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
                  <tr key={p.key} className="border-t border-border/40">
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
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-heading text-lg font-semibold">
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
    <section className="rounded-xl border border-border/60 bg-card/40 p-4">
      <h2 className="mb-3 font-heading text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ hint }: { hint: string }) {
  return <p className="text-sm text-muted-foreground">{hint}</p>;
}

function MarkedDot(props: {
  cx?: number;
  cy?: number;
  payload?: { key?: string };
  stroke?: string;
  markKey: string;
}) {
  const { cx, cy, payload, stroke, markKey } = props;
  if (cx == null || cy == null || payload?.key !== markKey) return <g />;
  return <circle cx={cx} cy={cy} r={4} fill={stroke ?? CHART_BLUE} />;
}
