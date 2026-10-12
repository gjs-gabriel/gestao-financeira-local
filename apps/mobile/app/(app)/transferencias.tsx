import { EntityListScreen } from "../../src/components/EntityListScreen";
import { useVault } from "../../src/vault/VaultProvider";

export default function TransferenciasScreen() {
  const { snapshot } = useVault();
  if (!snapshot) return null;
  const txs = (snapshot.transactions ?? []).filter(
    (t) => t.kind === "transfer",
  );

  return (
    <EntityListScreen
      title="Transferências"
      rows={txs.map((t) => ({
        id: t.id,
        title: t.description || "Transferência",
        subtitle: t.date,
        amount: t.amount,
      }))}
      emptyText="Nenhuma transferência registrada."
    />
  );
}
