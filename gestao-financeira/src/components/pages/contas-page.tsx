"use client";

import { useState } from "react";
import {
  accountBalance,
  archiveAccount,
  createAccountDraft,
  formatBrl,
  removeAccount,
  upsertAccount,
  type Account,
  type AccountType,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, parseMoneyInput } from "@/components/ui-helpers";
import { ConfirmDeleteDialog, EntityRow } from "@/components/entity-row";
import {
  InstitutionBadge,
  InstitutionSelect,
} from "@/components/institution-select";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Carteira / dinheiro",
  investment_cash: "Conta investimento",
  other: "Outra",
};

const emptyForm = () => ({
  name: "",
  type: "checking" as AccountType,
  openingBalance: "0",
  openingDate: new Date().toISOString().slice(0, 10),
  institutionId: undefined as string | undefined,
  institutionOther: undefined as string | undefined,
  notes: "",
});

export function ContasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const accounts = [...(snapshot.accounts ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  const txs = snapshot.transactions ?? [];

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Account) {
    setEditing(item);
    setForm({
      name: item.name,
      type: item.type,
      openingBalance: String(item.openingBalance).replace(".", ","),
      openingDate: item.openingDate,
      institutionId: item.institutionId,
      institutionOther: item.institutionOther,
      notes: item.notes ?? "",
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("Informe o nome da conta");
      return;
    }
    setBusy(true);
    try {
      const openingBalance = parseMoneyInput(form.openingBalance);
      const base = editing
        ? {
            ...editing,
            name: form.name.trim(),
            type: form.type,
            openingBalance,
            openingDate: form.openingDate,
            institutionId: form.institutionId,
            institutionOther: form.institutionOther,
            notes: form.notes.trim() || undefined,
            updatedAt: new Date().toISOString(),
          }
        : createAccountDraft({
            name: form.name.trim(),
            type: form.type,
            openingBalance,
            openingDate: form.openingDate,
            institutionId: form.institutionId,
            institutionOther: form.institutionOther,
            notes: form.notes.trim() || undefined,
          });
      await updateSnapshot((s) => upsertAccount(s, base));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contas"
        description="Contas bancárias, carteira e saldos — base do ledger (schema 4)."
        action={<Button onClick={openCreate}>Nova conta</Button>}
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta"
          description="Crie ao menos uma conta para registrar movimentos."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 px-4">
          {accounts.map((item) => {
            const balance = accountBalance(item, txs);
            return (
              <EntityRow
                key={item.id}
                title={item.name}
                subtitle={`${TYPE_LABELS[item.type]} · saldo ${formatBrl(balance)}${item.status === "archived" ? " · arquivada" : ""}`}
                amount={balance}
                badge={
                  <InstitutionBadge
                    institutionId={item.institutionId}
                    institutionOther={item.institutionOther}
                    institutions={snapshot.institutions}
                  />
                }
                onEdit={() => openEdit(item)}
                onDelete={() => setDeleteTarget(item)}
              />
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar conta" : "Nova conta"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Nubank corrente"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  if (!v) return;
                  setForm({ ...form, type: v as AccountType });
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) =>
                      value ? TYPE_LABELS[value as AccountType] : ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as AccountType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TYPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Saldo inicial</Label>
                <Input
                  value={form.openingBalance}
                  onChange={(e) =>
                    setForm({ ...form, openingBalance: e.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data do saldo</Label>
                <Input
                  type="date"
                  value={form.openingDate}
                  onChange={(e) =>
                    setForm({ ...form, openingDate: e.target.value })
                  }
                />
              </div>
            </div>
            <InstitutionSelect
              institutions={snapshot.institutions}
              institutionId={form.institutionId}
              institutionOther={form.institutionOther}
              onChange={(inst) => setForm({ ...form, ...inst })}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={deleteTarget?.name ?? ""}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await updateSnapshot((s) => removeAccount(s, deleteTarget.id));
          } catch {
            await updateSnapshot((s) => archiveAccount(s, deleteTarget.id));
          }
        }}
      />
    </div>
  );
}
