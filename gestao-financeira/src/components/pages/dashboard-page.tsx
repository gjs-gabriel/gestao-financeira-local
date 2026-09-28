"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  calendarEvents,
  categoryTrend,
  expenseLinesForMonth,
  expensesByCategoryForMonth,
  formatBrl,
  incomeCommitment,
  installmentLoadByMonth,
  listYearsAround,
  monthlyCashflow,
  monthLabel,
  netWorthLedger,
  percentChange,
  projectedCashflow,
  resolveInstitutionName,
  shiftMonth,
  totalDebts,
  totalInvestments,
  cashflowLastMonths,
  commitmentSplit,
  accountBalance,
  computeAlerts,
  detectAnomalies,
  invoiceAmount,
  type ExpenseLine,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { Money } from "@/components/ui-helpers";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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

const BAR = "#0F766E";
const BAR_OUT = "#B45309";
const LINE = "#1D4ED8";

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
  const { snapshot } = useVault();
  const now = new Date();
  const [institutionFilter, setInstitutionFilter] = useState("_all");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [span, setSpan] = useState<3 | 6 | 12>(12);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expense, setExpense] = useState<ExpenseLine | null>(null);
  const [trendCategory, setTrendCategory] = useState("_all");

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
  const installments = installmentLoadByMonth(view, year, month, 6);
  const projection = projectedCashflow(view, year, month, 6, now);
  const trends = categoryTrend(view, year, month, span);
  const events = calendarEvents(view, year, month);
  const upcoming = [
    ...calendarEvents(view, year, month),
    ...calendarEvents(
      view,
      shiftMonth(year, month, 1).year,
      shiftMonth(year, month, 1).month,
    ),
  ]
    .filter((event) => event.direction === "out" && event.date >= now.toISOString().slice(0, 10))
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

  const alerts = computeAlerts(snapshot, now).slice(0, 4);
  const anomalies = detectAnomalies(snapshot, now).slice(0, 3);
  const openInvoices = (snapshot.invoices ?? [])
    .filter((inv) => inv.status !== "paid")
    .map((inv) => ({
      inv,
      amount: invoiceAmount(inv, snapshot.transactions ?? []),
      cardName:
        snapshot.creditCards?.find((c) => c.id === inv.creditCardId)?.name ??
        "Cartão",
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate))
    .slice(0, 5);

  const categoryLines = categoryId
    ? lines.filter((line) => (line.categoryId ?? "_none") === categoryId)
    : [];
  const activeTrend =
    trends.find((row) => row.categoryId === trendCategory) ?? trends[0];

  const filteredAccounts =
    institutionFilter === "_all"
      ? (snapshot.accounts ?? []).filter((a) => a.status === "active")
      : institutionFilter === "_none"
        ? (snapshot.accounts ?? []).filter(
            (a) => a.status === "active" && !a.institutionId,
          )
        : (snapshot.accounts ?? []).filter(
            (a) => a.status === "active" && a.institutionId === institutionFilter,
          );

  const filteredPositions =
    institutionFilter === "_all"
      ? (snapshot.investmentPositions ?? []).length > 0
        ? snapshot.investmentPositions
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
          }))
      : ((snapshot.investmentPositions ?? []).length > 0
          ? snapshot.investmentPositions
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
            }))
        ).filter((p) =>
          institutionFilter === "_none"
            ? !p.institutionId
            : p.institutionId === institutionFilter,
        );

  const worth = netWorthLedger({
    accounts: filteredAccounts,
    transactions: snapshot.transactions ?? [],
    investments: filteredPositions,
    invoices: snapshot.invoices ?? [],
    debts: snapshot.debts,
  });
  const commitmentPct =
    commitment.ratio === null
      ? null
      : Math.round(Math.min(commitment.ratio, 9.99) * 100);

  return (
    <div>
      <header className="dash-hero mb-8">
        <p className="brand-mark">Gestão Financeira</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Seu panorama do mês
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          O que entrou, para onde foi e o que já está comprometido nos próximos meses.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/gastos" className={cn(buttonVariants())}>
            Registrar gasto
          </Link>
          <Link
            href="/fluxo"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Fluxo detalhado
          </Link>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label>Instituição</Label>
          <Select
            value={institutionFilter}
            onValueChange={(value) => {
              if (value) setInstitutionFilter(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: string | null) => {
                  if (!value || value === "_all") return "Todas";
                  if (value === "_none") return "Sem instituição";
                  return (
                    snapshot.institutions.find((item) => item.id === value)
                      ?.name ?? value
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas</SelectItem>
              <SelectItem value="_none">Sem instituição</SelectItem>
              {usedInstitutions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select
            value={String(month)}
            onValueChange={(value) => {
              if (value) setMonth(Number(value));
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue>
                {(value: string | null) =>
                  value ? MONTHS[Number(value) - 1] : ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
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
            onValueChange={(value) => {
              if (value) setYear(Number(value));
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue>
                {(value: string | null) => value ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {years.map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Janela</Label>
          <Select
            value={String(span)}
            onValueChange={(value) => {
              if (value === "3" || value === "6" || value === "12") {
                setSpan(Number(value) as 3 | 6 | 12);
              }
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue>
                {(value: string | null) =>
                  value ? `Últimos ${value} meses` : ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Entradas"
          value={cash.income}
          tone="plain"
          hint={
            <Delta
              current={cash.income}
              previous={previousCash.income}
              higherIsBetter
            />
          }
        />
        <Stat
          label="Saídas"
          value={cash.totalExpenses}
          tone="plain"
          hint={
            <Delta
              current={cash.totalExpenses}
              previous={previousCash.totalExpenses}
              higherIsBetter={false}
            />
          }
        />
        <Stat
          label="Saldo"
          value={cash.surplus}
          hint={
            <span className="text-[11px] text-muted-foreground capitalize">
              {MONTHS[month - 1]} {year}
            </span>
          }
        />
        <Stat
          label="Renda comprometida"
          valueText={commitmentPct === null ? "—" : `${commitmentPct}%`}
          hint={
            <span className="text-[11px] text-muted-foreground">
              Disponível {formatBrl(commitment.available)}
            </span>
          }
        />
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Patrimônio líquido" value={worth} />
        <Mini
          label="Saldos em contas"
          value={filteredAccounts.reduce(
            (sum, a) => sum + accountBalance(a, snapshot.transactions ?? []),
            0,
          )}
        />
        <Mini label="Aplicações" value={totalInvestments(view.investments)} />
        <Mini label="Dívidas" value={totalDebts(snapshot.debts)} plain />
      </div>

      <Section
        title="Fluxo de caixa"
        hint={`Cada barra é a receita. A parte em destaque é o gasto sobre os ganhos, até ${monthLabel(year, month)}.`}
      >
        {chartFlow.every((point) => point.entradas === 0 && point.saidas === 0) ? (
          <Empty hint="Cadastre rendas e gastos para ver a tendência." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartFlow}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={span === 12 ? 1 : 0} />
                <YAxis tickFormatter={brlTick} width={72} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, _name, item) => {
                    const amount = typeof value === "number" ? value : 0;
                    const income = Number(item?.payload?.entradas ?? 0);
                    const money = tooltipBrl(amount);
                    if (income <= 0) return money;
                    const pct = Math.round((amount / income) * 100);
                    return `${money} (${pct}% da receita)`;
                  }}
                />
                <Legend />
                <Bar dataKey="comprometido" name="Gasto" stackId="fluxo" fill={BAR_OUT} />
                <Bar dataKey="disponivel" name="Disponível" stackId="fluxo" fill={BAR} />
                <Bar dataKey="acima" name="Acima da receita" stackId="fluxo" fill="#BE123C" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Section title="Gastos por categoria" hint="Clique para ver os lançamentos">
          {categories.length === 0 ? (
            <Empty hint="Nenhum gasto neste mês." />
          ) : (
            <ul className="space-y-3">
              {categories.map((row) => {
                const pct = categoryTotal > 0 ? (row.amount / categoryTotal) * 100 : 0;
                return (
                  <li key={row.categoryId}>
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setCategoryId(row.categoryId)}
                    >
                      <div className="mb-1 flex justify-between gap-3 text-sm">
                        <span>{row.categoryName}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatBrl(row.amount)} · {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[#0F766E]"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Evolução do saldo" hint="Saldo do mês, não o saldo acumulado">
          <div className="mb-3 text-sm text-muted-foreground">
            Saldo de {monthLabel(year, month)}: <Money value={cash.surplus} />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartFlow}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={span === 12 ? 1 : 0} />
                <YAxis tickFormatter={brlTick} width={72} tick={{ fontSize: 11 }} />
                <Tooltip formatter={tooltipBrl} />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke={LINE}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Section title="Comprometimento da renda">
          <p className="mb-3 text-sm text-muted-foreground">
            Renda {formatBrl(commitment.income)} · comprometido{" "}
            {formatBrl(commitment.committed)} · disponível{" "}
            <Money value={commitment.available} />
          </p>
          <Progress
            value={commitment.ratio === null ? 0 : Math.min(commitment.ratio * 100, 100)}
            className="mb-4"
          />
          <ul className="space-y-1.5 text-sm">
            <FlowRow label="Recorrentes" value={commitment.recurring} />
            <FlowRow label="Parcelas" value={commitment.installments} />
            <FlowRow label="Pontuais" value={commitment.oneTime} />
          </ul>
        </Section>

        <Section title="Parcelas futuras" hint="Soma das parcelas já cadastradas">
          {installments.every((item) => item.amount === 0) ? (
            <Empty hint="Nenhuma parcela nos próximos meses." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={installments}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={brlTick} width={72} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={tooltipBrl} />
                  <Bar dataKey="amount" name="Parcelas" fill={BAR_OUT} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Próximos meses"
        hint="Rendas e gastos recorrentes, parcelas e lançamentos já datados. Meses futuros são projeção."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Mês</th>
                <th className="py-2 pr-3 font-medium">Entradas</th>
                <th className="py-2 pr-3 font-medium">Saídas</th>
                <th className="py-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((item) => (
                <tr key={item.key} className="border-t border-border/50">
                  <td className="py-2 pr-3 capitalize">
                    {item.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      {item.projected ? "previsto" : "realizado"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{formatBrl(item.income)}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatBrl(item.expenses)}</td>
                  <td className="py-2">
                    <Money value={item.surplus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Section title="Alertas" hint="Orçamentos, faturas e projeção">
          {alerts.length === 0 ? (
            <Empty hint="Nenhum alerta no momento." />
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Próximas faturas">
          {openInvoices.length === 0 ? (
            <Empty hint="Nenhuma fatura aberta. Compras no cartão aparecem aqui." />
          ) : (
            <ul className="space-y-2 text-sm">
              {openInvoices.map(({ inv, amount, cardName }) => (
                <li key={inv.id} className="flex justify-between gap-3">
                  <span>
                    {cardName}
                    <span className="text-muted-foreground">
                      {" "}
                      · vence {inv.dueDate}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatBrl(amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {anomalies.length > 0 ? (
        <Section
          title="Inteligência"
          hint="Padrões e anomalias — só sugestões"
        >
          <ul className="mb-3 space-y-2 text-sm">
            {anomalies.map((item) => (
              <li key={item.id}>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.message}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/inteligencia"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Ver inteligência
          </Link>
        </Section>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Section title="Maiores gastos do mês">
          {lines.length === 0 ? (
            <Empty hint="Sem lançamentos neste mês." />
          ) : (
            <ol className="space-y-2 text-sm">
              {lines.slice(0, 5).map((line, index) => (
                <li key={line.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between gap-3 text-left"
                    onClick={() => setExpense(line)}
                  >
                    <span>
                      <span className="text-muted-foreground">{index + 1}. </span>
                      {line.name}
                    </span>
                    <span className="tabular-nums">{formatBrl(line.amount)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section title="Próximos vencimentos">
          {upcoming.length === 0 ? (
            <Empty hint="Nada com data daqui para frente neste e no próximo mês." />
          ) : (
            <ul className="space-y-2 text-sm">
              {upcoming.map((event) => (
                <li key={`${event.date}-${event.name}`} className="flex justify-between gap-3">
                  <span>
                    <span className="text-muted-foreground">{event.date.slice(8)}/{event.date.slice(5, 7)} · </span>
                    {event.name}
                    <span className="text-muted-foreground"> · {event.kind}</span>
                  </span>
                  <span className="tabular-nums">{formatBrl(event.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Tabs defaultValue="calendario">
        <TabsList className="mb-4">
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="categorias">Evolução por categoria</TabsTrigger>
        </TabsList>
        <TabsContent value="calendario">
          <Section title={`Calendário · ${MONTHS[month - 1]} ${year}`}>
            <MonthCalendar year={year} month={month} events={events} />
          </Section>
        </TabsContent>
        <TabsContent value="categorias">
          <Section title="Evolução por categoria">
            {trends.length === 0 ? (
              <Empty hint="Sem gastos na janela selecionada." />
            ) : (
              <>
                <div className="mb-4 max-w-xs">
                  <Select
                    value={activeTrend?.categoryId ?? "_all"}
                    onValueChange={(value) => {
                      if (value) setTrendCategory(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) =>
                          trends.find((row) => row.categoryId === value)
                            ?.categoryName ?? "Categoria"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {trends.map((row) => (
                        <SelectItem key={row.categoryId} value={row.categoryId}>
                          {row.categoryName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeTrend && (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activeTrend.points} layout="vertical" margin={{ left: 8 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={72}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip formatter={tooltipBrl} />
                        <Bar dataKey="amount" name={activeTrend.categoryName} fill={BAR} radius={[0, 4, 4, 0]}>
                          {activeTrend.points.map((point) => (
                            <Cell key={point.key} fill={BAR} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </Section>
        </TabsContent>
      </Tabs>

      <Dialog open={categoryId !== null} onOpenChange={(open) => !open && setCategoryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {categoryLines[0]?.categoryName ?? "Categoria"}
            </DialogTitle>
          </DialogHeader>
          {categoryLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {categoryLines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3">
                  <span>
                    {line.name}
                    <span className="text-muted-foreground"> · {line.detail}</span>
                  </span>
                  <span className="tabular-nums">{formatBrl(line.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={expense !== null} onOpenChange={(open) => !open && setExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{expense?.name}</DialogTitle>
          </DialogHeader>
          {expense && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Valor no mês</dt>
                <dd className="tabular-nums">{formatBrl(expense.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{expense.kind}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Categoria</dt>
                <dd>{expense.categoryName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Detalhe</dt>
                <dd>{expense.detail}</dd>
              </div>
              {institutionFilter !== "_all" && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Instituição</dt>
                  <dd>
                    {resolveInstitutionName(
                      institutionFilter === "_none" ? undefined : institutionFilter,
                      undefined,
                      snapshot.institutions,
                    ) ?? "Sem instituição"}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  valueText,
  hint,
  tone = "signed",
}: {
  label: string;
  value?: number;
  valueText?: string;
  hint?: ReactNode;
  tone?: "signed" | "plain";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold">
        {valueText ??
          (tone === "plain" ? (
            <span className="tabular-nums">{formatBrl(value ?? 0)}</span>
          ) : (
            <Money value={value ?? 0} />
          ))}
      </p>
      {hint && <div className="mt-0.5">{hint}</div>}
    </div>
  );
}

function Mini({
  label,
  value,
  plain,
}: {
  label: string;
  value: number;
  plain?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/40 px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      {plain ? (
        <p className="font-medium tabular-nums">{formatBrl(value)}</p>
      ) : (
        <p className="font-medium">
          <Money value={value} />
        </p>
      )}
    </div>
  );
}

function Delta({
  current,
  previous,
  higherIsBetter,
}: {
  current: number;
  previous: number;
  higherIsBetter: boolean;
}) {
  const change = percentChange(current, previous);
  if (change === null) {
    return (
      <p className="text-[11px] text-muted-foreground">Sem base no mês anterior</p>
    );
  }
  const up = change > 0.05;
  const down = change < -0.05;
  const good = up ? higherIsBetter : down ? !higherIsBetter : true;
  const tone = !up && !down ? "text-muted-foreground" : good ? "text-emerald-800" : "text-rose-800";
  const sign = change > 0 ? "+" : "";
  return (
    <p className={`text-[11px] ${tone}`}>
      {sign}
      {change.toFixed(1).replace(".", ",")}% vs. mês anterior
    </p>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 rounded-xl border border-border/60 bg-card/40 p-4">
      <h2 className="font-heading text-lg font-medium">{title}</h2>
      {hint && <p className="mb-4 mt-1 text-xs text-muted-foreground">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Empty({ hint }: { hint: string }) {
  return <p className="text-sm text-muted-foreground">{hint}</p>;
}

function FlowRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatBrl(value)}</span>
    </li>
  );
}

function MonthCalendar({
  year,
  month,
  events,
}: {
  year: number;
  month: number;
  events: { date: string; direction: "in" | "out"; name: string; amount: number }[];
}) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  const byDay = new Map<number, typeof events>();
  for (const event of events) {
    const day = Number(event.date.slice(8, 10));
    const list = byDay.get(day) ?? [];
    list.push(event);
    byDay.set(day, list);
  }
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 text-center text-[11px] uppercase text-muted-foreground">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          const dayEvents = day ? (byDay.get(day) ?? []) : [];
          return (
            <div
              key={index}
              className="min-h-16 rounded-lg border border-border/40 p-1 text-xs"
              title={dayEvents
                .map((event) => `${event.name} ${formatBrl(event.amount)}`)
                .join("\n")}
            >
              <span className="text-muted-foreground">{day ?? ""}</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {dayEvents.slice(0, 3).map((event, eventIndex) => (
                  <span
                    key={eventIndex}
                    className={`size-1.5 rounded-full ${event.direction === "in" ? "bg-emerald-700" : "bg-rose-700"}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Verde: entrada. Vermelho: saída, parcela ou vencimento.
      </p>
    </div>
  );
}
