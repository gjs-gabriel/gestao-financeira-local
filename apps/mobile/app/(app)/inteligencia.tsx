import { detectRecurringCandidates } from "@gf/core";
import { Card, ListRow, Screen, Subtitle, Title } from "../../src/components/ui";
import { brl } from "../../src/lib/money";
import { useVault } from "../../src/vault/VaultProvider";

export default function InteligenciaScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const candidates = detectRecurringCandidates(snapshot);

  return (
    <Screen>
      <Title>Inteligência</Title>
      <Subtitle>
        Sugestões locais de recorrências detectadas. Confirme alterações só
        quando quiser.
      </Subtitle>
      <Card>
        {candidates.length === 0 ? (
          <Subtitle>Nenhuma recorrência candidata encontrada.</Subtitle>
        ) : (
          candidates.map((c) => (
            <ListRow
              key={c.key}
              title={c.name}
              subtitle={`${c.occurrences}× · ${c.suggestedFrequency} · confiança ${c.confidence}`}
              right={brl(c.amount)}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
