import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function OrcamentosScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const budgets = snapshot.budgets ?? [];

  return (
    <EntityListScreen
      title="Orçamentos"
      rows={budgets.map((b) => ({
        id: b.id,
        title: b.name,
        subtitle: b.periodKey ?? "todo mês",
        amount: b.limitAmount,
      }))}
      emptyText="Nenhum orçamento definido."
    />
  );
}
