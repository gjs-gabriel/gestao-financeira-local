import {
  buildAnnualReport,
  buildMonthReport,
  categoryTrendChart,
  formatBrl,
  listYearsAround,
  projectedBalanceSeries,
  projectedCashflow,
} from "@gf/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CHART, MoneyLineChart } from "../../src/components/MoneyCharts";
import {
  Card,
  ListRow,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { currentYearMonth } from "../../src/lib/money";
import { colors, fonts } from "../../src/theme";
import { useVault } from "../../src/vault/VaultProvider";

export default function RelatoriosScreen() {
  const { snapshot } = useVault();
  const now = new Date();
  const cur = currentYearMonth();
  const [tab, setTab] = useState<"mes" | "ano" | "projecao">("mes");
  const [year, setYear] = useState(cur.year);
  const [month] = useState(cur.month);
  const [horizon, setHorizon] = useState<3 | 6 | 12>(6);
  const years = listYearsAround(now.getFullYear(), 2);

  if (!snapshot) return null;

  const report = buildMonthReport(snapshot, year, month);
  const annual = buildAnnualReport(snapshot, year);
  const projection = projectedCashflow(snapshot, year, month, horizon, now);
  const trend = categoryTrendChart(snapshot, year, month, 12, 5);
  const balance = projectedBalanceSeries(projection);

  const yearChart = annual.months.map((m) => ({
    label: m.label,
    entradas: m.income,
    saidas: m.totalExpenses,
    saldo: m.surplus,
  }));

  return (
    <Screen>
      <Title>Relatórios</Title>
      <Subtitle>Despesas, tendências e projeção de saldo.</Subtitle>

      <View style={styles.tabs}>
        {(
          [
            ["mes", "Mês"],
            ["ano", "Ano"],
            ["projecao", "Projeção"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "mes" ? (
        <>
          <Card>
            <Subtitle>{report.label}</Subtitle>
            <ListRow
              title="Entradas"
              right={formatBrl(report.cashflow?.income ?? 0)}
            />
            <ListRow
              title="Saídas"
              right={formatBrl(report.cashflow?.totalExpenses ?? 0)}
            />
            <ListRow
              title="Saldo"
              right={formatBrl(report.cashflow?.surplus ?? 0)}
            />
            <ListRow
              title="PL atual"
              right={formatBrl(report.wealth.netWorth)}
            />
          </Card>

          {trend.series.length > 0 ? (
            <MoneyLineChart
              title="Gastos por categoria"
              hint="Trajetória das cinco categorias que mais pesam, até este mês."
              series={trend.series.map((s, index) => ({
                name: s.categoryName,
                color: CHART.cats[index % CHART.cats.length],
                data: trend.points.map((p) => ({
                  label: p.label,
                  value: p.values[s.categoryId] ?? 0,
                })),
              }))}
            />
          ) : null}

          <Card>
            <Subtitle>Categorias do mês</Subtitle>
            {report.categories.length === 0 ? (
              <Subtitle>Sem gastos no mês.</Subtitle>
            ) : (
              report.categories.map((c) => (
                <ListRow
                  key={c.categoryId}
                  title={c.categoryName}
                  right={formatBrl(c.amount)}
                />
              ))
            )}
          </Card>

          <Card>
            <Subtitle>Por instituição</Subtitle>
            {report.byInstitution.length === 0 ? (
              <Subtitle>Sem gastos com instituição.</Subtitle>
            ) : (
              report.byInstitution.map((row) => (
                <ListRow
                  key={row.name}
                  title={row.name}
                  right={formatBrl(row.amount)}
                />
              ))
            )}
          </Card>

          <Card>
            <ListRow
              title="Assinaturas (mensal est.)"
              subtitle={`${report.subscriptions.count} itens`}
              right={formatBrl(report.subscriptions.monthly)}
            />
          </Card>
        </>
      ) : null}

      {tab === "ano" ? (
        <>
          <Card>
            <Subtitle>Ano</Subtitle>
            <View style={styles.yearRow}>
              {years.map((y) => (
                <Pressable
                  key={y}
                  onPress={() => setYear(y)}
                  style={[styles.yearChip, y === year && styles.yearChipOn]}
                >
                  <Text
                    style={[styles.yearText, y === year && styles.yearTextOn]}
                  >
                    {y}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ListRow
              title="Entradas"
              right={formatBrl(annual.totals.income)}
            />
            <ListRow
              title="Saídas"
              right={formatBrl(annual.totals.totalExpenses)}
            />
            <ListRow title="Saldo" right={formatBrl(annual.totals.surplus)} />
          </Card>

          <MoneyLineChart
            title="Tendência combinada de caixa"
            hint="Linhas de fluxo do ano"
            series={[
              {
                name: "Entradas",
                color: CHART.income,
                data: yearChart.map((m) => ({
                  label: m.label,
                  value: m.entradas,
                })),
              },
              {
                name: "Saídas",
                color: CHART.expense,
                data: yearChart.map((m) => ({
                  label: m.label,
                  value: m.saidas,
                })),
              },
              {
                name: "Saldo",
                color: CHART.brand,
                data: yearChart.map((m) => ({
                  label: m.label,
                  value: m.saldo,
                })),
              },
            ]}
          />
        </>
      ) : null}

      {tab === "projecao" ? (
        <>
          <Card>
            <Subtitle>Horizonte</Subtitle>
            <View style={styles.yearRow}>
              {([3, 6, 12] as const).map((h) => (
                <Pressable
                  key={h}
                  onPress={() => setHorizon(h)}
                  style={[styles.yearChip, h === horizon && styles.yearChipOn]}
                >
                  <Text
                    style={[
                      styles.yearText,
                      h === horizon && styles.yearTextOn,
                    ]}
                  >
                    {`${h} meses`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <MoneyLineChart
            title="Saldo projetado"
            hint="Realizado até o mês corrente e previsto a partir dele."
            series={[
              {
                name: "Realizado",
                color: CHART.brand,
                data: balance
                  .filter((p) => p.realizado != null)
                  .map((p) => ({
                    label: p.label,
                    value: p.realizado ?? 0,
                  })),
              },
              {
                name: "Previsto",
                color: CHART.insight,
                data: balance
                  .filter((p) => p.previsto != null)
                  .map((p) => ({
                    label: p.label,
                    value: p.previsto ?? 0,
                  })),
              },
            ]}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = {
  tabs: {
    flexDirection: "row" as const,
    gap: 4,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center" as const,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.muted, fontFamily: fonts.sansBold, fontSize: 13 },
  tabTextActive: { color: "#f4faf7" },
  yearRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearChipOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  yearText: { color: colors.muted, fontFamily: fonts.sansBold },
  yearTextOn: { color: colors.fg },
};
