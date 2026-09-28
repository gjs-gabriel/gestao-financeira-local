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
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const CHART_TEAL = "oklch(0.42 0.09 175)";
const CHART_AMBER = "oklch(0.55 0.1 55)";
const CHART_BLUE = "oklch(0.48 0.1 250)";
const CAT_COLORS = [
  "oklch(0.45 0.09 175)",
  "oklch(0.55 0.1 55)",
  "oklch(0.48 0.1 250)",
  "oklch(0.5 0.08 200)",
  "oklch(0.52 0.1 25)",
  "oklch(0.5 0.06 145)",
  "oklch(0.55 0.08 300)",
  "oklch(0.48 0.04 165)",
];

function brlTick(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function tooltipBrl(value: unknown) {
  if (typeof value !== "number") return String(value ?? "");
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Olá, {firstName}
        </h1>
        <p className="mt-2 text-muted-foreground">
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
        <p className="type-label">Patrimônio líquido</p>
        <p className="type-display mt-2 text-4xl text-investment md:text-5xl">
          {formatBrl(worth)}
        </p>
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
              <AreaChart data={wealthSeries}>
                <defs>
                  <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_BLUE} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART_BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.02 170)" }}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => tooltipBrl(v)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid oklch(0.9 0.015 165)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pl"
                  name="Patrimônio"
                  stroke={CHART_BLUE}
                  fill="url(#plFill)"
                  strokeWidth={2}
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
        className="border-t border-border/40"
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

      <div className="grid gap-10 border-t border-border/40 lg:grid-cols-12">
        <Section
          title="Para onde vai meu dinheiro?"
          hint={topCatHint}
          className="lg:col-span-7"
        >
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há gastos neste mês. Adicione lançamentos para ver a
              distribuição.
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categories.slice(0, 6).map((c) => ({
                    name: c.categoryName,
                    valor: c.amount,
                    id: c.categoryId,
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 8 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "oklch(0.4 0.02 170)" }}
                  />
                  <Tooltip
                    formatter={(v) => tooltipBrl(v)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid oklch(0.9 0.015 165)",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="valor"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(d) => {
                      const id = (d as { id?: string }).id;
                      if (id) setCategoryId(id);
                    }}
                  >
                    {categories.slice(0, 6).map((_, i) => (
                      <Cell
                        key={i}
                        fill={CAT_COLORS[i % CAT_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <Section
          title="Próximos compromissos"
          hint="Saídas com data nos próximos dias"
          className="lg:col-span-5"
        >
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
        </Section>
      </div>

      <div className="grid gap-10 border-t border-border/40 lg:grid-cols-12">
        <Section
          title="Meu dinheiro está aumentando ou diminuindo?"
          hint="Entradas e saídas ao longo da janela selecionada"
          className="lg:col-span-7"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartFlow}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "oklch(0.5 0.02 170)" }}
                />
                <YAxis
                  tickFormatter={brlTick}
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "oklch(0.5 0.02 170)" }}
                />
                <Tooltip
                  formatter={(v) => tooltipBrl(v)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid oklch(0.9 0.015 165)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="entradas" name="Entradas" fill={CHART_TEAL} radius={[3, 3, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill={CHART_AMBER} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Minhas metas" className="lg:col-span-5">
          {snapshot.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cadastre metas para acompanhar o progresso rumo aos seus
              objetivos.
            </p>
          ) : (
            <ul className="space-y-5">
              {snapshot.goals.slice(0, 4).map((goal) => {
                const p = goalProgress(goal);
                return (
                  <li key={goal.id}>
                    <div className="mb-1.5 flex justify-between gap-2 text-sm">
                      <span className="font-medium">{goal.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {Math.round(p * 100)}%
                      </span>
                    </div>
                    <ProgressBar value={p} tone="investment" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBrl(goal.currentAmount)} /{" "}
                      {formatBrl(goal.targetAmount)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/metas"
            className="mt-4 inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            Ver todas as metas
          </Link>
        </Section>
      </div>

      {insights.length > 0 ? (
        <Section
          title="Insights"
          hint="Observações calculadas a partir dos seus dados"
          className="border-t border-border/40"
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
        className="border-t border-border/40"
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
      className="border-t border-border/40"
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
          href="/analista"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Ver análise completa
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
        <SelectTrigger className={cn("h-9", width)}>
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
