import { createLocalId } from "../../src/adapters/profiles";
import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function AplicacoesScreen() {
  const { snapshot, updateSnapshot } = useVault();
  if (!snapshot) return null;
  const now = new Date().toISOString();

  return (
    <EntityListScreen
      title="Aplicações"
      rows={snapshot.investments.map((i) => ({
        id: i.id,
        title: i.name,
        subtitle: i.classification,
        amount: i.amount,
      }))}
      onAdd={async ({ title, amount }) => {
        await updateSnapshot((s) => ({
          ...s,
          investments: [
            ...s.investments,
            {
              id: createLocalId("inv"),
              name: title,
              amount,
              classification: "outro",
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
