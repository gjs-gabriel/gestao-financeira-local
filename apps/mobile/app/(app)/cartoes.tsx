import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function CartoesScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const cards = snapshot.creditCards ?? [];

  return (
    <EntityListScreen
      title="Cartões"
      subtitle="Cartões do ledger."
      rows={cards.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: `${c.closingDay}/${c.dueDay}`,
        amount: c.limit,
      }))}
      emptyText="Nenhum cartão neste cofre."
    />
  );
}
