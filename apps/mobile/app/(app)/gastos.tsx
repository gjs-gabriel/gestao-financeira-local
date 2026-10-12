import { createLocalId } from "../../src/adapters/profiles";
import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function GastosScreen() {
  const { snapshot, updateSnapshot } = useVault();
  if (!snapshot) return null;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  return (
    <EntityListScreen
      title="Gastos"
      rows={[
        ...snapshot.recurringExpenses.map((e) => ({
          id: e.id,
          title: e.name,
          subtitle: `Recorrente · ${e.frequency}`,
          amount: e.amount,
        })),
        ...snapshot.oneTimeExpenses.map((e) => ({
          id: e.id,
          title: e.name,
          subtitle: `Pontual · ${e.date}`,
          amount: e.amount,
        })),
      ]}
      addLabel="Novo gasto pontual"
      onAdd={async ({ title, amount }) => {
        await updateSnapshot((s) => ({
          ...s,
          oneTimeExpenses: [
            ...s.oneTimeExpenses,
            {
              id: createLocalId("ote"),
              name: title,
              amount,
              date: today,
              createdAt: now,
              updatedAt: now,
            },
          ],
          updatedAt: now,
        }));
      }}
    />
  );
}
