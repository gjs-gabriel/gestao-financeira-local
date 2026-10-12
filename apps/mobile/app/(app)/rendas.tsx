import { createLocalId } from "../../src/adapters/profiles";
import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function RendasScreen() {
  const { snapshot, updateSnapshot } = useVault();
  if (!snapshot) return null;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  return (
    <EntityListScreen
      title="Rendas"
      rows={[
        ...snapshot.incomes.map((i) => ({
          id: i.id,
          title: i.name,
          subtitle: `Recorrente · ${i.type}`,
          amount: i.amount,
        })),
        ...snapshot.oneTimeIncomes.map((i) => ({
          id: i.id,
          title: i.name,
          subtitle: `Pontual · ${i.date}`,
          amount: i.amount,
        })),
      ]}
      addLabel="Nova renda pontual"
      onAdd={async ({ title, amount }) => {
        await updateSnapshot((s) => ({
          ...s,
          oneTimeIncomes: [
            ...s.oneTimeIncomes,
            {
              id: createLocalId("oti"),
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
