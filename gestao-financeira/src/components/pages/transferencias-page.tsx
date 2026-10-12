"use client";

import { useState } from "react";
import {
  accountBalance,
  createId,
  createTransfer,
  formatBrl,
  upsertEntity,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, parseMoneyInput } from "@/components/ui-helpers";

export function TransferenciasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("Transferência");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!snapshot) return null;

  const accounts = (snapshot.accounts ?? []).filter((a) => a.status === "active");
  const transfers = (snapshot.transactions ?? [])
    .filter((tx) => tx.kind === "transfer")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  async function submit() {
    setError(null);
    setOk(null);
    const value = parseMoneyInput(amount);
    if (!fromId || !toId || fromId === toId) {
      setError("Escolha contas de origem e destino diferentes");
      return;
    }
    if (value <= 0) {
      setError("Informe um valor válido");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const tx = createTransfer({
        id: createId("tx"),
        fromAccountId: fromId,
        toAccountId: toId,
        amount: value,
        date,
        description: description.trim() || "Transferência",
        now,
      });
      await updateSnapshot((s) => upsertEntity(s, "transactions", tx));
      setAmount("");
      setOk("Transferência registrada (não altera patrimônio líquido).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Transferências"
        description="Movimenta saldos entre contas sem criar receita ou despesa."
      />

      {accounts.length < 2 ? (
        <EmptyState
          title="Precisa de ao menos duas contas"
          description="Crie outra conta em Contas para transferir."
        />
      ) : (
        <section className="mb-8 max-w-lg space-y-3 surface-panel p-4">
          <div className="space-y-1.5">
            <Label>De</Label>
            <Select
              value={fromId || "_none"}
              onValueChange={(v) => v && setFromId(v === "_none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: string | null) =>
                    !v || v === "_none"
                      ? "Conta origem"
                      : accounts.find((a) => a.id === v)?.name ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Conta origem</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {formatBrl(accountBalance(a, snapshot.transactions ?? []))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Para</Label>
            <Select
              value={toId || "_none"}
              onValueChange={(v) => v && setToId(v === "_none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: string | null) =>
                    !v || v === "_none"
                      ? "Conta destino"
                      : accounts.find((a) => a.id === v)?.name ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Conta destino</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {ok && <p className="text-sm text-income">{ok}</p>}
          <Button onClick={submit} disabled={busy}>
            Transferir
          </Button>
        </section>
      )}

      <h2 className="mb-3 font-heading text-lg font-medium">Recentes</h2>
      {transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma transferência ainda.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {transfers.map((tx) => {
            const from = accounts.find((a) => a.id === tx.accountId)?.name ?? "?";
            const to =
              accounts.find((a) => a.id === tx.counterAccountId)?.name ?? "?";
            return (
              <li
                key={tx.id}
                className="flex justify-between gap-3 rounded-lg border border-border/40 px-3 py-2"
              >
                <span>
                  {tx.date} · {from} → {to}
                  <span className="text-muted-foreground"> · {tx.description}</span>
                </span>
                <span className="tabular-nums">{formatBrl(tx.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
