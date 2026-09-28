"use client";

import { useState } from "react";
import {
  createId,
  INCOME_TYPE_LABELS,
  removeIncomeSynced,
  upsertIncomeSynced,
  type Income,
  type IncomeType,
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

const emptyForm = () => ({
  name: "",
  type: "salary" as IncomeType,
  amount: "",
  dayOfMonth: "",
  notes: "",
  institutionId: undefined as string | undefined,
  institutionOther: undefined as string | undefined,
});

export function RendasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Income) {
    setEditing(item);
    setForm({
      name: item.name,
      type: item.type,
      amount: String(item.amount).replace(".", ","),
      dayOfMonth: item.dayOfMonth ? String(item.dayOfMonth) : "",
      notes: item.notes ?? "",
      institutionId: item.institutionId,
      institutionOther: item.institutionOther,
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    const amount = parseMoneyInput(form.amount);
    if (!form.name.trim() || amount <= 0) {
      setError("Informe nome e valor válidos");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: Income = {
        id: editing?.id ?? createId("inc"),
        name: form.name.trim(),
        type: form.type,
        amount,
        dayOfMonth: form.dayOfMonth
          ? Math.min(31, Math.max(1, Number(form.dayOfMonth)))
          : undefined,
        notes: form.notes.trim() || undefined,
        institutionId: form.institutionId,
        institutionOther: form.institutionOther,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertIncomeSynced(s, item));
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
        title="Rendas"
        description="Salário, VR, VA e outras entradas mensais."
        action={<Button onClick={openCreate}>Nova renda</Button>}
      />

      {snapshot.incomes.length === 0 ? (
        <EmptyState
          title="Nenhuma renda cadastrada"
          description="Adicione salário e benefícios para calcular o fluxo do mês."
          action={<Button onClick={openCreate}>Adicionar renda</Button>}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 px-4">
          {snapshot.incomes.map((item) => (
            <EntityRow
              key={item.id}
              title={item.name}
              subtitle={INCOME_TYPE_LABELS[item.type]}
              amount={item.amount}
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
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar renda" : "Nova renda"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Salário CLT"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  if (!v) return;
                  setForm({ ...form, type: v as IncomeType });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {INCOME_TYPE_LABELS[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <InstitutionSelect
              institutions={snapshot.institutions}
              institutionId={form.institutionId}
              institutionOther={form.institutionOther}
              onChange={(inst) => setForm({ ...form, ...inst })}
            />
            <div className="space-y-1.5">
              <Label>Valor mensal (R$)</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="4500,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dia do mês (opcional)</Label>
              <Input
                value={form.dayOfMonth}
                onChange={(e) =>
                  setForm({ ...form, dayOfMonth: e.target.value })
                }
                placeholder="5"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
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
          await updateSnapshot((s) => removeIncomeSynced(s, deleteTarget.id));
        }}
      />
    </div>
  );
}
