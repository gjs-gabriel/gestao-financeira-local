import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function AssinaturasScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const subs = snapshot.recurringExpenses.filter((e) =>
    /assinatura|spotify|netflix|disney|amazon|prime|icloud|youtube|gym|academia/i.test(
      e.name,
    ),
  );
  const rows = (subs.length ? subs : snapshot.recurringExpenses).map((e) => ({
    id: e.id,
    title: e.name,
    subtitle: e.frequency,
    amount: e.amount,
  }));

  return (
    <EntityListScreen
      title="Assinaturas"
      subtitle={
        subs.length
          ? "Recorrências que parecem assinaturas."
          : "Todas as despesas recorrentes (nenhuma assinatura óbvia)."
      }
      rows={rows}
    />
  );
}
