import { buildFinancialAlerts, buildFinancialSnapshot } from "@gf/core";
import { Card, ListRow, Screen, Subtitle, Title } from "../../src/components/ui";
import { currentYearMonth } from "../../src/lib/money";
import { useVault } from "../../src/vault/VaultProvider";

export default function AlertasScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const { year, month } = currentYearMonth();
  const fin = buildFinancialSnapshot(snapshot, year, month);
  const alerts = buildFinancialAlerts(fin);

  return (
    <Screen>
      <Title>Alertas</Title>
      <Subtitle>Alertas gerados por regras locais no seu cofre.</Subtitle>
      <Card>
        {alerts.length === 0 ? (
          <Subtitle>Nenhum alerta no momento.</Subtitle>
        ) : (
          alerts.map((a) => (
            <ListRow key={a.id} title={a.title} subtitle={a.summary} />
          ))
        )}
      </Card>
    </Screen>
  );
}
