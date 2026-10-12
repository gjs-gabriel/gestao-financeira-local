"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  buildDashboardInsights,
  calendarEvents,
  cashflowLastMonths,
  commitmentSplit,
  expenseLinesForMonth,
  expensesByCategoryForMonth,
  formatBrl,
  goalProgress,
  incomeCommitment,
  listYearsAround,
  monthlyCashflow,
  netWorthLedger,
  percentChange,
  shiftMonth,
  wealthHistorySeries,
  type ExpenseLine,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { useAI } from "@/ai/ui/AIProvider";
import {
  FinancialInsight,
  Metric,
  Money,
  ProgressBar,
  Section,
  StatGroup,
} from "@/components/ui-helpers";
import { GlowCard } from "@/components/ui/glow-card";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_BAR_CLASS,
  CHART_BAR_GAP,
  CHART_BAR_RADIUS_TOP,
  CHART_BAR_SIZE,
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

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function DashboardPage() {
  const { snapshot, activeProfile } = useVault();
  const now = new Date();
  const [institutionFilter, setInstitutionFilter] = useState("_all");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [span, setSpan] = useState<6 | 12>(12);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expense, setExpense] = useState<ExpenseLine | null>(null);

  const years = useMemo(() => listYearsAround(now.getFullYear(), 2), [now]);

  if (!snapshot) return null;

  function matchesInstitution(institutionId?: string) {
    if (institutionFilter === "_all") return true;
    if (institutionFilter === "_none") return !institutionId;
    return institutionId === institutionFilter;
  }

  const view =
    institutionFilter === "_all"
      ? snapshot
      : {
          ...snapshot,
          incomes: snapshot.incomes.filter((item) =>
            matchesInstitution(item.institutionId),
          ),
          oneTimeIncomes: snapshot.oneTimeIncomes.filter((item) =>
            matchesInstitution(item.institutionId),
          ),
          investments: snapshot.investments.filter((item) =>
            matchesInstitution(item.institutionId),
          ),
          recurringExpenses: snapshot.recurringExpenses.filter((item) =>
            matchesInstitution(item.institutionId),
          ),
          oneTimeExpenses: snapshot.oneTimeExpenses.filter((item) =>
            matchesInstitution(item.institutionId),
          ),
          installmentExpenses: (snapshot.installmentExpenses ?? []).filter(
            (item) => matchesInstitution(item.institutionId),
          ),
        };

  const cash = monthlyCashflow(view, year, month);
  const previous = shiftMonth(year, month, -1);
  const previousCash = monthlyCashflow(view, previous.year, previous.month);
  const commitment = incomeCommitment(cash);
  const series = cashflowLastMonths(view, year, month, span);
  const categories = expensesByCategoryForMonth(view, year, month);
  const categoryTotal = categories.reduce((sum, row) => sum + row.amount, 0);
  const lines = expenseLinesForMonth(view, year, month);
  const upcoming = [
    ...calendarEvents(view, year, month),
    ...calendarEvents(
      view,
      shiftMonth(year, month, 1).year,
      shiftMonth(year, month, 1).month,
    ),
  ]
    .filter(
      (event) =>
        event.direction === "out" &&
        event.date >= now.toISOString().slice(0, 10),
    )
    .slice(0, 6);

  const chartFlow = series.map((point) => {
    const split = commitmentSplit(point.income, point.totalExpenses);
    return {
      label: point.label,
      entradas: Math.round(point.income * 100) / 100,
      saidas: Math.round(point.totalExpenses * 100) / 100,
      saldo: Math.round(point.surplus * 100) / 100,
      ...split,
    };
  });

  const wealthSeries = wealthHistorySeries(snapshot).map((p) => ({
    label: p.periodKey.slice(5),
    pl: p.netWorth,
  }));

  const filteredAccounts =
    institutionFilter === "_all"
      ? (snapshot.accounts ?? []).filter((a) => a.status === "active")
      : institutionFilter === "_none"
        ? (snapshot.accounts ?? []).filter(
            (a) => a.status === "active" && !a.institutionId,
          )
        : (snapshot.accounts ?? []).filter(
            (a) =>
              a.status === "active" && a.institutionId === institutionFilter,
          );

  const filteredPositions =
    (snapshot.investmentPositions ?? []).length > 0
      ? (snapshot.investmentPositions ?? []).filter((p) =>
          institutionFilter === "_all"
            ? true
            : institutionFilter === "_none"
              ? !p.institutionId
              : p.institutionId === institutionFilter,
        )
      : view.investments.map((inv) => ({
          id: inv.id,
          name: inv.name,
          amount: inv.amount,
          classification: inv.classification,
          categoryId: inv.categoryId,
          institutionId: inv.institutionId,
          institutionOther: inv.institutionOther,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
        }));

  const worth = netWorthLedger({
    accounts: filteredAccounts,
    transactions: snapshot.transactions ?? [],
    investments: filteredPositions,
    invoices: snapshot.invoices ?? [],
    debts: snapshot.debts,
  });

  const wealthAll = wealthHistorySeries(snapshot);
  const wealthYoY =
    wealthAll.length >= 2
      ? percentChange(
          wealthAll[wealthAll.length - 1]!.netWorth,
          wealthAll[0]!.netWorth,
        )
      : null;

  const commitmentPct =
    commitment.ratio === null
      ? null
      : Math.round(Math.min(commitment.ratio, 9.99) * 100);

  const topCat = categories[0];
  const topCatHint =
    topCat && categoryTotal > 0
      ? `${topCat.categoryName} representa ${Math.round((topCat.amount / categoryTotal) * 100)}% dos seus gastos este mês.`
      : undefined;

  const insights = buildDashboardInsights(snapshot, year, month, now);
  const firstName = (activeProfile?.name ?? "você").split(" ")[0];

  const usedInstitutions = snapshot.institutions.filter(
    (inst) =>
      snapshot.investments.some((item) => item.institutionId === inst.id) ||
      snapshot.incomes.some((item) => item.institutionId === inst.id) ||
      snapshot.recurringExpenses.some((item) => item.institutionId === inst.id) ||
      snapshot.oneTimeExpenses.some((item) => item.institutionId === inst.id) ||
      (snapshot.installmentExpenses ?? []).some(
        (item) => item.institutionId === inst.id,
      ) ||
      (snapshot.accounts ?? []).some((item) => item.institutionId === inst.id),
  );

  const categoryLines = categoryId
    ? lines.filter((line) => (line.categoryId ?? "_none") === categoryId)
    : [];

  return (
    <div>
      <header className="dash-hero mb-10">
        <p className="type-label mb-2">Painel</p>
        <h1 className="font-heading text-3xl font-black tracking-tight md:text-4xl">
          Olá, {firstName}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Seu panorama financeiro · {MONTHS[month - 1]} {year}
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Mês"
            value={String(month)}
            onChange={(v) => setMonth(Number(v))}
            width="w-32"
            renderValue={(v) => (v ? MONTHS[Number(v) - 1] : "")}
          >
            {MONTHS.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Ano"
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            width="w-24"
          >
            {years.map((item) => (
              <SelectItem key={item} value={String(item)}>
                {item}
              </SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Período"
            value={String(span)}
            onChange={(v) => setSpan(Number(v) as 6 | 12)}
            width="w-36"
            renderValue={(v) =>
              v === "6" ? "6 meses" : v === "12" ? "12 meses" : ""
            }
          >
            <SelectItem value="6">6 meses</SelectItem>
            <SelectItem value="12">12 meses</SelectItem>
          </FilterSelect>
          <FilterSelect
            label="Instituição"
            value={institutionFilter}
            onChange={setInstitutionFilter}
            width="w-44"
            renderValue={(v) => {
              if (!v || v === "_all") return "Todas";
              if (v === "_none") return "Sem instituição";
              return (
                snapshot.institutions.find((item) => item.id === v)?.name ?? v
              );
            }}
          >
            <SelectItem value="_all">Todas</SelectItem>
            <SelectItem value="_none">Sem instituição</SelectItem>
            {usedInstitutions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </FilterSelect>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href="/gastos" className={cn(buttonVariants({ size: "sm" }))}>
              + Gasto
            </Link>
            <Link
              href="/fluxo"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Fluxo
            </Link>
          </div>
        </div>
      </header>

      {/* Patrimônio protagonista */}
      <Section className="border-t border-border/40 pt-8">
        <GlowCard className="max-w-xl">
          <p className="type-label">Patrimônio líquido</p>
          <Money
            value={worth}
            display
            className="mt-2 text-4xl md:text-5xl"
          />
        </GlowCard>
        {wealthYoY !== null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            <span
              className={
                wealthYoY >= 0 ? "text-income" : "text-expense"
              }
            >
              {wealthYoY >= 0 ? "+" : ""}
              {wealthYoY.toFixed(1).replace(".", ",")}%
            </span>{" "}
            na série de patrimônio registrada
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Evolução aparece conforme o histórico de patrimônio cresce.
          </p>
        )}
        {wealthSeries.length > 1 ? (
          <div className="mt-6 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={wealthSeries} margin={{ left: 4, right: 4 }}>
                <defs>
                  <ChartGradient id="dash-pl-fill" color={CHART_BRAND} />
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
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <Tooltip
                  content={<GlassChartTooltip formatter={tooltipBrl} />}
                  cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="pl"
                  name="Patrimônio"
                  stroke={CHART_BRAND}
                  fill="url(#dash-pl-fill)"
                  strokeWidth={CHART_STROKE}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </Section>

      {/* Este mês */}
      <Section
        title="Este mês"
        hint="Entradas, saídas e o que sobrou no período selecionado"
        className="surface-panel px-4"
      >
        <StatGroup>
          <Metric
            label="Entradas"
            value={formatBrl(cash.income)}
            tone="income"
            hint={deltaHint(cash.income, previousCash.income, true)}
          />
          <Metric
            label="Saídas"
            value={formatBrl(cash.totalExpenses)}
            tone="expense"
            hint={deltaHint(cash.totalExpenses, previousCash.totalExpenses, false)}
          />
          <Metric
            label="Disponível"
            value={<Money value={cash.surplus} />}
            hint="Entradas − saídas"
          />
          <Metric
            label="Renda comprometida"
            value={commitmentPct === null ? "—" : `${commitmentPct}%`}
            hint="Quanto da renda do mês já foi usada"
          />
        </StatGroup>
      </Section>

      <DashboardAIMonthCard />

      <h2 className="font-heading mt-2 border-b border-border pb-2 text-[22px] font-extrabold tracking-tight">
        Painel de Fluxo e Distribuição
      </h2>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="glass-surface card-premium-hover rounded-2xl p-6">
          <p className="type-label mb-3">
            Distribuição geométrica de gastos (mês atual)
          </p>
          <Money
            value={categoryTotal}
            display
            className="mb-6 text-[34px]"
          />
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há gastos neste mês. Adicione lançamentos para ver a
              distribuição.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {categories.slice(0, 4).map((c, i) => {
                const share =
                  categoryTotal > 0 ? c.amount / categoryTotal : 0;
                const tones = [
                  "primary",
                  "expense",
                  "investment",
                  "insight",
                ] as const;
                return (
                  <li key={c.categoryId}>
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setCategoryId(c.categoryId)}
                    >
                      <div className="mb-1.5 flex justify-between text-xs font-semibold">
                        <span>{c.categoryName}</span>
                        <span className="tabular-nums">
                          {(share * 100).toFixed(0)}%
                        </span>
                      </div>
                      <ProgressBar value={share} tone={tones[i % tones.length]} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {categories[0] ? (
            <div className="insight-footer">
              <span className="pulse-indicator" aria-hidden />
              <span>
                <strong className="text-foreground">
                  {categories[0].categoryName}
                </strong>{" "}
                representa a maior concentração de saídas deste ciclo.
              </span>
            </div>
          ) : topCatHint ? (
            <p className="mt-4 text-xs text-muted-foreground">{topCatHint}</p>
          ) : null}
        </div>

        <div className="glass-surface card-premium-hover rounded-2xl p-6">
          <p className="type-label mb-3">
            Acompanhamento de metas de longo prazo
          </p>
          <Money
            value={snapshot.goals.reduce((s, g) => s + g.targetAmount, 0)}
            display
            className="mb-6 text-[34px]"
          />
          {snapshot.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cadastre metas para acompanhar o progresso rumo aos seus
              objetivos.
            </p>
          ) : (
            <ul className="space-y-3">
              {snapshot.goals.slice(0, 3).map((goal, i) => {
                const p = goalProgress(goal);
                const tones = ["investment", "income", "insight"] as const;
                return (
                  <li key={goal.id} className="meta-box">
                    <div className="mb-1.5 flex justify-between text-[13px] font-semibold">
                      <span>{goal.name}</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          tones[i % 3] === "income" && "text-income",
                          tones[i % 3] === "investment" && "text-investment",
                          tones[i % 3] === "insight" && "text-insight",
                        )}
                      >
                        {(p * 100).toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar
                      value={p}
                      tone={tones[i % 3]}
                      className="h-1.5"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatBrl(goal.currentAmount)} acumulados de{" "}
                      {formatBrl(goal.targetAmount)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/metas"
            className="mt-4 inline-block text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
          >
            Ver todas as metas
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-6 border-t border-border/40 pt-8 lg:grid-cols-12">
        <Section
          title="Meu dinheiro está aumentando ou diminuindo?"
          hint="Entradas e saídas ao longo da janela selecionada"
          className="lg:col-span-7"
        >
          <div className="glass-surface h-56 rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartFlow}
                barSize={CHART_BAR_SIZE}
                barGap={CHART_BAR_GAP}
              >
                <ChartGrid />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tick={chartAxisTick}
                />
                <Tooltip
                  content={<GlassChartTooltip formatter={tooltipBrl} />}
                  cursor={{ fill: "oklch(from var(--muted) l c h / 0.35)" }}
                />
                <Bar
                  dataKey="entradas"
                  name="Entradas"
                  fill={CHART_INCOME}
                  radius={CHART_BAR_RADIUS_TOP}
                  className={CHART_BAR_CLASS}
                />
                <Bar
                  dataKey="saidas"
                  name="Saídas"
                  fill={CHART_EXPENSE}
                  radius={CHART_BAR_RADIUS_TOP}
                  className={CHART_BAR_CLASS}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section
          title="Próximos compromissos"
          hint="Saídas com data nos próximos dias"
          className="lg:col-span-5"
        >
          <div className="glass-surface rounded-2xl p-4">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum compromisso futuro cadastrado neste período.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {upcoming.map((ev) => (
                  <li
                    key={`${ev.date}-${ev.name}-${ev.amount}`}
                    className="flex items-baseline justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{ev.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ev.date.slice(8, 10)}/{ev.date.slice(5, 7)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-expense">
                      −{formatBrl(ev.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>

      {insights.length > 0 ? (
        <Section
          title="Insights"
          hint="Observações calculadas a partir dos seus dados"
          className="surface-panel px-4"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {insights.map((item) => (
              <FinancialInsight
                key={item.id}
                title={item.title}
                description={item.description}
                tone={item.tone}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Maiores gastos do mês"
        className="surface-panel px-4"
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem lançamentos neste mês.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {lines.slice(0, 8).map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => setExpense(line)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {line.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {line.kind}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-expense">
                    {formatBrl(line.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog
        open={categoryId !== null}
        onOpenChange={(o) => !o && setCategoryId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gastos da categoria</DialogTitle>
          </DialogHeader>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {categoryLines.map((line) => (
              <li key={line.id} className="flex justify-between gap-3">
                <span>{line.name}</span>
                <span className="tabular-nums">{formatBrl(line.amount)}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!expense} onOpenChange={(o) => !o && setExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{expense?.name}</DialogTitle>
          </DialogHeader>
          {expense ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Valor</dt>
                <dd className="tabular-nums">{formatBrl(expense.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{expense.kind}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function deltaHint(
  current: number,
  previous: number,
  higherIsBetter: boolean,
): string | undefined {
  const change = percentChange(current, previous);
  if (change === null) return undefined;
  const sign = change > 0 ? "+" : "";
  const label = `${sign}${change.toFixed(1).replace(".", ",")}% vs. mês anterior`;
  void higherIsBetter;
  return label;
}

function DashboardAIMonthCard() {
  const { overviewText, insights, alerts } = useAI();
  const top = insights[0] ?? alerts[0];
  return (
    <Section
      title="✦ Análise do mês"
      hint="Resumo calculado localmente — sem enviar dados para servidores"
      className="surface-panel px-4"
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {overviewText || "Abra o Analista para um panorama completo."}
      </p>
      {top ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Destaque: {top.summary}
        </p>
      ) : null}
      <div className="mt-4">
        <Link
          href="/finn"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Conversar com Finn
        </Link>
      </div>
    </Section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  width,
  renderValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  width?: string;
  renderValue?: (v: string | null) => React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger className={cn("h-8 rounded-lg", width)}>
          {renderValue ? (
            <SelectValue>{renderValue}</SelectValue>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
