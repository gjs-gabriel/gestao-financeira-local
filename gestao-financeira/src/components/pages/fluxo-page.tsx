"use client";

import { useMemo, useState } from "react";
import {
  annualCashflow,
  cashflowLastMonths,
  commitmentSplit,
  expenseCompositionSeries,
  futureInstallmentSeries,
  listYearsAround,
  monthlyCashflowDetailed,
  monthLabel,
  savingsRateSeries,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import {
  CHART_AMBER,
  CHART_BLUE,
  CHART_ROSE,
  CHART_TEAL,
  brlTick,
  chartTooltipStyle,
  monthAxisTick,
  percentDomain,
  tooltipBrl,
  tooltipPercent,
  valueAxisTick,
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
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
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
        title="Fluxo"
        description="Como seu dinheiro se comportou ao longo do tempo."
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
                <SelectTrigger className="h-9 w-36">
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
                <SelectTrigger className="h-9 w-28">
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
                <BarChart data={chart12} margin={{ left: 4, right: 4 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "oklch(0.5 0.02 170)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={64}
                    tick={{ fontSize: 10, fill: "oklch(0.5 0.02 170)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value, name, item) => {
                      const amount = typeof value === "number" ? value : 0;
                      const income = Number(item?.payload?.entradas ?? 0);
                      const money = tooltipBrl(amount);
                      if (income <= 0) return money;
                      const pct = Math.round((amount / income) * 100);
                      return `${money} (${pct}% da receita)`;
                    }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid oklch(0.9 0.015 165)",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="comprometido"
                    name="Gasto"
                    stackId="fluxo"
                    fill="oklch(0.55 0.1 55)"
                  />
                  <Bar
                    dataKey="disponivel"
                    name="Disponível"
                    stackId="fluxo"
                    fill="oklch(0.42 0.09 175)"
                  />
                  <Bar
                    dataKey="acima"
                    name="Acima da receita"
                    stackId="fluxo"
                    fill="oklch(0.5 0.12 20)"
                    radius={[3, 3, 0, 0]}
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
                <BarChart data={composition} margin={{ left: 4, right: 4 }}>
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
                  <Bar dataKey="recorrente" name="Recorrente" stackId="tipo" fill={CHART_AMBER} />
                  <Bar dataKey="pontual" name="Pontual" stackId="tipo" fill={CHART_TEAL} />
                  <Bar
                    dataKey="parcelas"
                    name="Parcelas"
                    stackId="tipo"
                    fill={CHART_BLUE}
                    radius={[3, 3, 0, 0]}
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
                <LineChart data={savings} margin={{ left: 4, right: 4 }}>
                  <XAxis
                    dataKey="label"
                    tick={monthAxisTick}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={(value: number) => `${value}%`}
                    width={48}
                    tickLine={false}
                    axisLine={false}
                    tick={valueAxisTick}
                    domain={percentDomain}
                  />
                  <ReferenceLine y={0} stroke="oklch(0.7 0.02 170)" strokeDasharray="3 3" />
                  <Tooltip formatter={tooltipPercent} contentStyle={chartTooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="taxa"
                    name="Sobra"
                    stroke={CHART_TEAL}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
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
                <BarChart data={installmentsAhead} margin={{ left: 4, right: 4 }}>
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
                  <Bar dataKey="parcelas" name="Parcelas" fill={CHART_ROSE} radius={[3, 3, 0, 0]} />
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
              <SelectTrigger className="h-9 w-28">
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

          <section className="border-t border-border/40 pt-6">
            <h2 className="mb-4 text-base font-medium">
              Tendência mês a mês · {year}
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartYear} margin={{ left: 4, right: 4 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "oklch(0.5 0.02 170)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={brlTick}
                    width={64}
                    tick={{ fontSize: 10, fill: "oklch(0.5 0.02 170)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={tooltipBrl}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid oklch(0.9 0.015 165)",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke="oklch(0.42 0.1 155)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke="oklch(0.55 0.1 55)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    name="Saldo"
                    stroke="oklch(0.48 0.1 250)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="overflow-x-auto border-t border-border/40">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-1 py-3">Mês</th>
                  <th className="px-1 py-3">Entradas</th>
                  <th className="px-1 py-3">Saídas</th>
                  <th className="px-1 py-3">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {annual.months.map((m) => (
                  <tr key={m.key} className="border-t border-border/40">
                    <td className="px-1 py-2.5 capitalize">{m.label}</td>
                    <td className="px-1 py-2.5">
                      <Money value={m.income} />
                    </td>
                    <td className="px-1 py-2.5">
                      <Money value={m.totalExpenses} />
                    </td>
                    <td className="px-1 py-2.5">
                      <Money value={m.surplus} />
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

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <Money value={value} />
    </li>
  );
}
