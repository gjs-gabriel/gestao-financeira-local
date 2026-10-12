import {
  annualCashflow,
  cashflowLastMonths,
  commitmentSplit,
  expenseCompositionSeries,
  formatBrl,
  futureInstallmentSeries,
  listYearsAround,
  monthLabel,
  monthlyCashflowDetailed,
  savingsRateSeries,
} from "@gf/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  CHART,
  MoneyBarChart,
  MoneyLineChart,
  MoneyStackedBarChart,
} from "../../src/components/MoneyCharts";
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

export default function FluxoScreen() {
  const { snapshot } = useVault();
  const now = new Date();
  const cur = currentYearMonth();
  const [tab, setTab] = useState<"mensal" | "anual">("mensal");
  const [year, setYear] = useState(cur.year);
  const [month] = useState(cur.month);
  const years = listYearsAround(now.getFullYear(), 2);

  if (!snapshot) return null;

  const monthDetail = monthlyCashflowDetailed(snapshot, year, month);
  const last12 = cashflowLastMonths(snapshot, year, month, 12);
  const annual = annualCashflow(snapshot, year);
  const composition = expenseCompositionSeries(last12);
  const savings = savingsRateSeries(last12);
  const installmentsAhead = futureInstallmentSeries(snapshot, year, month, 12);

  const chart12 = last12.map((p) => {
    const split = commitmentSplit(p.income, p.totalExpenses);
    return {
      label: p.label,
      values: {
        comprometido: split.comprometido,
        disponivel: split.disponivel,
        acima: split.acima,
      },
    };
  });

  return (
    <Screen>
      <Title>Fluxo</Title>
      <Subtitle>
        Visão de distribuição de saídas e comportamento do caixa.
      </Subtitle>

      <View style={styles.tabs}>
        <TabButton
          label="Mensal"
          active={tab === "mensal"}
          onPress={() => setTab("mensal")}
        />
        <TabButton
          label="Anual"
          active={tab === "anual"}
          onPress={() => setTab("anual")}
        />
      </View>

      {tab === "mensal" ? (
        <>
          <Card>
            <Subtitle>{monthLabel(year, month)}</Subtitle>
            <ListRow title="Entradas" right={formatBrl(monthDetail.income)} />
            <ListRow
              title="Gastos recorrentes"
              right={formatBrl(-monthDetail.recurringExpenses)}
            />
            <ListRow
              title="Gastos pontuais"
              right={formatBrl(-monthDetail.oneTimeExpenses)}
            />
            <ListRow
              title="Parcelas"
              right={formatBrl(-monthDetail.installmentExpenses)}
            />
            <ListRow title="Sobra" right={formatBrl(monthDetail.surplus)} />
          </Card>

          <MoneyStackedBarChart
            title="Meu dinheiro está aumentando ou diminuindo?"
            hint="Últimos 12 meses — receita e quanto dela foi comprometida."
            series={[
              { key: "comprometido", name: "Gasto", color: CHART.expense },
              { key: "disponivel", name: "Disponível", color: CHART.income },
              { key: "acima", name: "Acima da receita", color: CHART.debt },
            ]}
            rows={chart12}
          />

          <MoneyStackedBarChart
            title="De que tipo são as saídas?"
            hint="Últimos 12 meses — recorrente, pontual (inclui cartão) e parcelas."
            series={[
              { key: "recorrente", name: "Recorrente", color: CHART.expense },
              { key: "pontual", name: "Pontual", color: CHART.brand },
              { key: "parcelas", name: "Parcelas", color: CHART.invest },
            ]}
            rows={composition.map((p) => ({
              label: p.label,
              values: {
                recorrente: p.recorrente,
                pontual: p.pontual,
                parcelas: p.parcelas,
              },
            }))}
          />

          <MoneyLineChart
            title="Quanto da entrada sobrou?"
            hint="Saldo ÷ entrada do mês. Meses sem entrada ficam sem ponto."
            ySuffix="%"
            series={[
              {
                name: "Sobra",
                color: CHART.income,
                data: savings
                  .filter((p) => p.taxa != null)
                  .map((p) => ({
                    label: p.label,
                    value: p.taxa ?? 0,
                  })),
              },
            ]}
          />

          <MoneyBarChart
            title="Quando as parcelas aliviam?"
            hint={`Carga de parcelas nos 12 meses a partir de ${monthLabel(year, month)}.`}
            data={installmentsAhead.map((p) => ({
              label: p.label,
              value: p.parcelas,
              frontColor: CHART.expense,
            }))}
          />
        </>
      ) : (
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
              title={`Entradas ${year}`}
              right={formatBrl(annual.totals.income)}
            />
            <ListRow
              title={`Saídas ${year}`}
              right={formatBrl(annual.totals.totalExpenses)}
            />
            <ListRow
              title={`Sobra ${year}`}
              right={formatBrl(annual.totals.surplus)}
            />
          </Card>

          <MoneyLineChart
            title="Caixa no ano"
            hint="Entradas, saídas e saldo mês a mês"
            series={[
              {
                name: "Entradas",
                color: CHART.income,
                data: annual.months.map((m) => ({
                  label: m.label,
                  value: m.income,
                })),
              },
              {
                name: "Saídas",
                color: CHART.expense,
                data: annual.months.map((m) => ({
                  label: m.label,
                  value: m.totalExpenses,
                })),
              },
              {
                name: "Saldo",
                color: CHART.brand,
                data: annual.months.map((m) => ({
                  label: m.label,
                  value: m.surplus,
                })),
              },
            ]}
          />
        </>
      )}
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = {
  tabs: {
    flexDirection: "row" as const,
    gap: 8,
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
  tabText: { color: colors.muted, fontFamily: fonts.sansBold, fontSize: 14 },
  tabTextActive: { color: "#f4faf7" },
  yearRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  yearText: { color: colors.muted, fontFamily: fonts.sansBold },
  yearTextOn: { color: colors.fg },
};
