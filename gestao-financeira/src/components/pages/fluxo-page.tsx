"use client";

import { useMemo, useState } from "react";
import {
  annualCashflow,
  cashflowLastMonths,
  commitmentSplit,
  listYearsAround,
  monthlyCashflowDetailed,
  monthLabel,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { EmptyState, Money, PageHeader } from "@/components/ui-helpers";
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
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function brlTick(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function tooltipBrl(v: unknown) {
  if (typeof v !== "number") return String(v ?? "");
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

  return (
    <div>
      <PageHeader
        title="Fluxo de caixa"
        description="Entradas × saídas no mês e no ano — cálculos no domínio, gráficos só na UI."
      />

      {!hasActivity ? (
        <EmptyState
          title="Sem movimentos ainda"
          description="Cadastre rendas e gastos, ou importe um extrato em Importar, para ver o fluxo."
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList className="mb-4">
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
          <TabsTrigger value="anual">Anual</TabsTrigger>
        </TabsList>

        <TabsContent value="mensal" className="space-y-6">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => {
                  if (!v) return;
                  setMonth(Number(v));
                }}
              >
                <SelectTrigger className="w-36">
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
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => {
                  if (!v) return;
                  setYear(Number(v));
                }}
              >
                <SelectTrigger className="w-28">
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

          <p className="font-heading text-lg font-medium capitalize">
            {monthLabel(year, month)}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Entradas" value={monthDetail.income} />
            <Stat label="Saídas" value={monthDetail.totalExpenses} />
            <Stat label="Saldo" value={monthDetail.surplus} />
            <Stat
              label="Pontuais (gastos)"
              value={monthDetail.oneTimeExpenses}
            />
          </div>

          <ul className="space-y-1.5 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-sm">
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

          <section className="rounded-xl border border-border/60 bg-card/40 p-4">
            <h2 className="mb-1 font-heading text-lg font-medium">
              Últimos 12 meses
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Cada barra é a receita do mês. A parte marcada é o quanto os gastos comprometem esses ganhos.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart12} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tickFormatter={brlTick} width={64} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value, name, item) => {
                      const amount = typeof value === "number" ? value : 0;
                      const income = Number(item?.payload?.entradas ?? 0);
                      const money = tooltipBrl(amount);
                      if (income <= 0) return money;
                      const pct = Math.round((amount / income) * 100);
                      return `${money} (${pct}% da receita)`;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="comprometido" name="Gasto" stackId="fluxo" fill="#B45309" />
                  <Bar dataKey="disponivel" name="Disponível" stackId="fluxo" fill="#0F766E" />
                  <Bar dataKey="acima" name="Acima da receita" stackId="fluxo" fill="#BE123C" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="anual" className="space-y-6">
          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => {
                if (!v) return;
                setYear(Number(v));
              }}
            >
              <SelectTrigger className="w-28">
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

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Entradas ${year}`} value={annual.totals.income} />
            <Stat label={`Saídas ${year}`} value={annual.totals.totalExpenses} />
            <Stat label={`Saldo ${year}`} value={annual.totals.surplus} />
          </div>

          <section className="rounded-xl border border-border/60 bg-card/40 p-4">
            <h2 className="mb-3 font-heading text-lg font-medium">
              Mês a mês · {year}
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartYear} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={brlTick} width={64} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={tooltipBrl} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke="#0F766E"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke="#B45309"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    name="Saldo"
                    stroke="#1D4ED8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

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
                    <td className="px-3 py-2">
                      <Money value={m.income} />
                    </td>
                    <td className="px-3 py-2">
                      <Money value={m.totalExpenses} />
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
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl font-semibold">
        <Money value={value} />
      </p>
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
