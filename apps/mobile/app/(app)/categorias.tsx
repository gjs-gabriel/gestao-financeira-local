import { createLocalId } from "../../src/adapters/profiles";
import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function CategoriasScreen() {
  const { snapshot, updateSnapshot } = useVault();
  if (!snapshot) return null;
  const now = new Date().toISOString();

  return (
    <EntityListScreen
      title="Categorias"
      rows={snapshot.categories.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.kind,
      }))}
      addLabel="Nova categoria"
      requireAmount={false}
      onAdd={async ({ title }) => {
        await updateSnapshot((s) => ({
          ...s,
          categories: [
            ...s.categories,
            {
              id: createLocalId("cat"),
              name: title,
              kind: "expense",
              createdAt: now,
            },
          ],
          updatedAt: now,
        }));
      }}
    />
  );
}
