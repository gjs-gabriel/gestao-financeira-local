import {
  formatBrl,
  positionHistoryChart,
  wealthBreakdown,
  wealthChartSeries,
  wealthHistorySeries,
} from "@gf/core";
import { CHART, MoneyLineChart } from "../../src/components/MoneyCharts";
import {
  Card,
  ListRow,
  Money,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { useVault } from "../../src/vault/VaultProvider";

export default function PatrimonioScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;

  const w = wealthBreakdown(snapshot);
  const series = wealthChartSeries(wealthHistorySeries(snapshot));
  const positions = positionHistoryChart(
    snapshot.investmentPositionHistory ?? [],
    new Map(snapshot.investments.map((item) => [item.id, item.name])),
  );

  return (
    <Screen>
      <Title>Patrimônio</Title>
      <Subtitle>Ativos menos passivos — a visão do que você construiu.</Subtitle>

      <Card>
        <Subtitle>Patrimônio líquido</Subtitle>
        <Money value={w.netWorth} />
      </Card>

      <Card>
        <ListRow
          title="Ativos"
          subtitle={`Contas ${formatBrl(w.accounts)} · Aplicações ${formatBrl(w.investments)}`}
          right={formatBrl(w.assets)}
        />
        <ListRow
          title="Passivos"
          subtitle={`Dívidas ${formatBrl(w.debts)} · Faturas ${formatBrl(w.invoices)}`}
          right={formatBrl(w.liabilities)}
        />
        <ListRow
          title="Saldo líquido"
          subtitle="Ativos − passivos"
          right={formatBrl(w.netWorth)}
        />
      </Card>

      <MoneyLineChart
        title="Estou construindo patrimônio?"
        hint="Evolução registrada ao usar o cofre"
        emptyText="Histórico ainda curto. Continue usando o aplicativo: o patrimônio mensal é registrado e a curva aparece aqui."
        series={[
          {
            name: "Ativos",
            color: CHART.income,
            data: series.map((p) => ({ label: p.label, value: p.ativos })),
          },
          {
            name: "Passivos",
            color: CHART.debt,
            data: series.map((p) => ({ label: p.label, value: p.passivos })),
          },
          {
            name: "Patrimônio líquido",
            color: CHART.brand,
            data: series.map((p) => ({ label: p.label, value: p.pl })),
          },
        ]}
      />

      {positions.series.length > 0 ? (
        <MoneyLineChart
          title="Como as posições evoluíram?"
          hint="Aplicações com pelo menos dois registros no histórico"
          series={positions.series.slice(0, 5).map((item, index) => ({
            name: item.name,
            color: CHART.cats[index % CHART.cats.length],
            data: positions.points.map((point) => ({
              label: `${point.date.slice(8, 10)}/${point.date.slice(5, 7)}`,
              value: point.values[item.investmentId] ?? 0,
            })),
          }))}
        />
      ) : null}
    </Screen>
  );
}
