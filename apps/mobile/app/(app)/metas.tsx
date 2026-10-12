import { createLocalId } from "../../src/adapters/profiles";
import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function MetasScreen() {
  const { snapshot, updateSnapshot } = useVault();
  if (!snapshot) return null;
  const now = new Date().toISOString();

  return (
    <EntityListScreen
      title="Metas"
      rows={snapshot.goals.map((g) => ({
        id: g.id,
        title: g.name,
        subtitle: `Atual ${g.currentAmount}`,
        amount: g.targetAmount,
      }))}
      onAdd={async ({ title, amount }) => {
        await updateSnapshot((s) => ({
          ...s,
          goals: [
            ...s.goals,
            {
              id: createLocalId("goal"),
              name: title,
              targetAmount: amount,
              currentAmount: 0,
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
