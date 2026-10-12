import { createLocalId } from "../../src/adapters/profiles";
import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function ContasScreen() {
  const { snapshot, updateSnapshot } = useVault();
  if (!snapshot) return null;
  const accounts = snapshot.accounts ?? [];
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  return (
    <EntityListScreen
      title="Contas"
      subtitle="Saldos e contas do ledger."
      rows={accounts.map((a) => ({
        id: a.id,
        title: a.name,
        subtitle: a.type,
        amount: a.openingBalance,
      }))}
      onAdd={async ({ title, amount }) => {
        await updateSnapshot((s) => ({
          ...s,
          accounts: [
            ...(s.accounts ?? []),
            {
              id: createLocalId("acc"),
              name: title,
              type: "checking",
              openingBalance: amount,
              openingDate: today,
              currency: "BRL",
              status: "active",
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
