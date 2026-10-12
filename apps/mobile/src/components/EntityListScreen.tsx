import { useState } from "react";
import {
  Button,
  Card,
  Field,
  Label,
  ListRow,
  Screen,
  Subtitle,
  Title,
} from "./ui";
import { brl } from "../lib/money";

export function EntityListScreen(props: {
  title: string;
  subtitle?: string;
  rows: { id: string; title: string; subtitle?: string; amount?: number }[];
  emptyText?: string;
  addLabel?: string;
  /** Quando false, só pede descrição (ex.: categorias). */
  requireAmount?: boolean;
  onAdd?: (input: { title: string; amount: number }) => Promise<void>;
}) {
  const requireAmount = props.requireAmount !== false;
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen>
      <Title>{props.title}</Title>
      {props.subtitle ? <Subtitle>{props.subtitle}</Subtitle> : null}
      <Card>
        {props.rows.length === 0 ? (
          <Subtitle>{props.emptyText ?? "Nada cadastrado ainda."}</Subtitle>
        ) : (
          props.rows.map((r) => (
            <ListRow
              key={r.id}
              title={r.title}
              subtitle={r.subtitle}
              right={r.amount != null ? brl(r.amount) : undefined}
            />
          ))
        )}
      </Card>
      {props.onAdd ? (
        <Card>
          <Label>{props.addLabel ?? "Novo item"}</Label>
          <Field
            value={title}
            onChangeText={setTitle}
            placeholder="Descrição"
          />
          {requireAmount ? (
            <Field
              value={amount}
              onChangeText={setAmount}
              placeholder="Valor"
              keyboardType="decimal-pad"
            />
          ) : null}
          {error ? <Subtitle>{error}</Subtitle> : null}
          <Button
            title={busy ? "Salvando…" : "Adicionar"}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                if (!title.trim()) throw new Error("Informe a descrição.");
                let n = 0;
                if (requireAmount) {
                  n = Number(String(amount).replace(",", "."));
                  if (!Number.isFinite(n) || n <= 0) {
                    throw new Error("Informe um valor válido.");
                  }
                }
                await props.onAdd!({ title: title.trim(), amount: n });
                setTitle("");
                setAmount("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Erro");
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
