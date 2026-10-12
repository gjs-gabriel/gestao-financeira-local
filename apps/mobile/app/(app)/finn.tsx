import {
  buildFinancialInsights,
  buildFinancialSnapshot,
  formatBrl,
} from "@gf/core";
import { Card, ListRow, Screen, Subtitle, Title } from "../../src/components/ui";
import { currentYearMonth } from "../../src/lib/money";
import { useVault } from "../../src/vault/VaultProvider";

export default function FinnScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const { year, month } = currentYearMonth();
  const fin = buildFinancialSnapshot(snapshot, year, month);
  const insights = buildFinancialInsights(fin);

  return (
    <Screen>
      <Title>Finn</Title>
      <Subtitle>Insights numéricos calculados neste aparelho.</Subtitle>
      <Card>
        <ListRow title="Renda do mês" right={formatBrl(fin.income.current)} />
        <ListRow title="Gastos do mês" right={formatBrl(fin.expenses.current)} />
        <ListRow title="Sobra" right={formatBrl(fin.cashFlow.surplus)} />
      </Card>
      <Card>
        {insights.length === 0 ? (
          <Subtitle>Sem insights neste período.</Subtitle>
        ) : (
          insights.map((i) => (
            <ListRow key={i.id} title={i.title} subtitle={i.summary} />
          ))
        )}
      </Card>
    </Screen>
  );
}
