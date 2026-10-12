import {
  analyzeBudgetOpportunities,
  analyzePortfolioForAI,
  buildFinancialAlerts,
  buildFinancialInsights,
  buildFinancialSnapshot,
  formatBrl,
} from "@gf/core";
import { Card, ListRow, Screen, Subtitle, Title } from "../../src/components/ui";
import { currentYearMonth } from "../../src/lib/money";
import { useVault } from "../../src/vault/VaultProvider";

export default function AnalistaScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const { year, month } = currentYearMonth();
  const fin = buildFinancialSnapshot(snapshot, year, month);
  const alerts = buildFinancialAlerts(fin);
  const insights = buildFinancialInsights(fin);
  const portfolio = analyzePortfolioForAI(fin);
  const budget = analyzeBudgetOpportunities(fin);

  return (
    <Screen>
      <Title>Analista</Title>
      <Subtitle>Motor de regras neste aparelho — análise sem rede.</Subtitle>
      <Card>
        <Subtitle>Alertas</Subtitle>
        {alerts.slice(0, 5).map((a) => (
          <ListRow key={a.id} title={a.title} subtitle={a.summary} />
        ))}
        {alerts.length === 0 ? <Subtitle>Nenhum alerta.</Subtitle> : null}
      </Card>
      <Card>
        <Subtitle>Portfólio</Subtitle>
        <ListRow title="Resumo" subtitle={portfolio.summary} />
        {portfolio.concentrationNote ? (
          <ListRow title="Concentração" subtitle={portfolio.concentrationNote} />
        ) : null}
        {portfolio.goalsNote ? (
          <ListRow title="Metas" subtitle={portfolio.goalsNote} />
        ) : null}
        {portfolio.debtsNote ? (
          <ListRow title="Dívidas" subtitle={portfolio.debtsNote} />
        ) : null}
      </Card>
      <Card>
        <Subtitle>{`Orçamento — ${budget.summary}`}</Subtitle>
        {budget.opportunities.slice(0, 5).map((b) => (
          <ListRow
            key={b.id}
            title={b.title}
            subtitle={b.summary}
            right={
              b.potentialMonthly != null
                ? formatBrl(b.potentialMonthly)
                : undefined
            }
          />
        ))}
      </Card>
      <Card>
        <Subtitle>Insights</Subtitle>
        {insights.slice(0, 6).map((i) => (
          <ListRow key={i.id} title={i.title} subtitle={i.summary} />
        ))}
      </Card>
    </Screen>
  );
}
