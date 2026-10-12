import {
  calendarEvents,
  cashflowLastMonths,
  formatBrl,
  incomeCommitment,
  monthlyCashflow,
  percentChange,
  shiftMonth,
  wealthHistorySeries,
} from "@gf/core";
import {
  CHART,
  MoneyGroupedBarChart,
  MoneyLineChart,
} from "../../src/components/MoneyCharts";
import {
  Card,
  ListRow,
  Money,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { currentYearMonth } from "../../src/lib/money";
import { useVault } from "../../src/vault/VaultProvider";

export default function PainelScreen() {
  const { snapshot, activeProfile } = useVault();
  if (!snapshot) return null;

  const now = new Date();
  const { year, month } = currentYearMonth();
  const cash = monthlyCashflow(snapshot, year, month);
  const previous = shiftMonth(year, month, -1);
  const previousCash = monthlyCashflow(snapshot, previous.year, previous.month);
  const commitment = incomeCommitment(cash);
  const series = cashflowLastMonths(snapshot, year, month, 12);
  const surplusDelta = percentChange(cash.surplus, previousCash.surplus);

  const upcoming = [
    ...calendarEvents(snapshot, year, month),
    ...calendarEvents(
      snapshot,
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

  const wealthSeries = wealthHistorySeries(snapshot).map((p) => ({
    label: p.periodKey.slice(5),
    value: p.netWorth,
  }));

  return (
    <Screen>
      <Title>Painel</Title>
      <Subtitle>
        {`${activeProfile?.name ?? "Usuário"} · ${String(month).padStart(2, "0")}/${year}`}
      </Subtitle>

      <Card>
        <Subtitle>Sobra do mês</Subtitle>
        <Money value={cash.surplus} />
        {surplusDelta != null ? (
          <Subtitle>
            {`${surplusDelta >= 0 ? "+" : ""}${surplusDelta.toFixed(0)}% vs mês anterior`}
          </Subtitle>
        ) : null}
      </Card>

      <Card>
        <ListRow title="Receitas" right={formatBrl(cash.income)} />
        <ListRow title="Despesas" right={formatBrl(cash.totalExpenses)} />
        <ListRow
          title="Comprometido da renda"
          subtitle={
            commitment.ratio != null
              ? `${Math.round(commitment.ratio * 100)}% da renda`
              : "Sem renda no mês"
          }
          right={formatBrl(commitment.committed)}
        />
        <ListRow title="Disponível" right={formatBrl(commitment.available)} />
      </Card>

      <MoneyGroupedBarChart
        title="Meu dinheiro está aumentando ou diminuindo?"
        hint="Entradas e saídas ao longo dos últimos 12 meses"
        data={series.map((p) => ({
          label: p.label,
          a: Math.round(p.income * 100) / 100,
          b: Math.round(p.totalExpenses * 100) / 100,
        }))}
      />

      <Card>
        <Subtitle>Próximos compromissos</Subtitle>
        <Subtitle>Saídas com data nos próximos dias</Subtitle>
        {upcoming.length === 0 ? (
          <Subtitle>Nenhum compromisso futuro cadastrado neste período.</Subtitle>
        ) : (
          upcoming.map((ev) => (
            <ListRow
              key={`${ev.date}-${ev.name}-${ev.amount}`}
              title={ev.name}
              subtitle={`${ev.date.slice(8, 10)}/${ev.date.slice(5, 7)}`}
              right={`−${formatBrl(ev.amount)}`}
            />
          ))
        )}
      </Card>

      <MoneyLineChart
        title="Patrimônio líquido"
        hint="Evolução registrada no cofre"
        emptyText="Histórico ainda curto — continue usando o app."
        series={[
          {
            name: "PL",
            color: CHART.brand,
            data: wealthSeries,
          },
        ]}
      />

      <Card>
        <ListRow
          title="Contas"
          subtitle={`${snapshot.accounts?.length ?? 0} cadastradas`}
        />
        <ListRow
          title="Metas"
          subtitle={`${snapshot.goals?.length ?? 0} ativas`}
        />
      </Card>
    </Screen>
  );
}
