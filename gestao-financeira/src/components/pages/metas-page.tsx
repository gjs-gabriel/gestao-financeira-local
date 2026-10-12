"use client";

import { useState } from "react";
import { createId, formatBrl, goalProgress, smartGoalInsight, type Goal } from "@/domain";
import { removeEntity, upsertEntity } from "@/domain/snapshot";
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
  EmptyState,
  Money,
  PageHeader,
  ProgressBar,
  parseMoneyInput,
} from "@/components/ui-helpers";
import { ConfirmDeleteDialog } from "@/components/entity-row";
import { Pencil, Trash2 } from "lucide-react";

export function MetasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState({
    name: "",
    targetAmount: "",
    currentAmount: "",
    deadline: "",
    notes: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      targetAmount: "",
      currentAmount: "0",
      deadline: "",
      notes: "",
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Goal) {
    setEditing(item);
    setForm({
      name: item.name,
      targetAmount: String(item.targetAmount).replace(".", ","),
      currentAmount: String(item.currentAmount).replace(".", ","),
      deadline: item.deadline ?? "",
      notes: item.notes ?? "",
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    const targetAmount = parseMoneyInput(form.targetAmount);
    const currentAmount = parseMoneyInput(form.currentAmount);
    if (!form.name.trim() || targetAmount <= 0) {
      setError("Informe nome e meta válidos");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: Goal = {
        id: editing?.id ?? createId("goal"),
        name: form.name.trim(),
        targetAmount,
        currentAmount,
        deadline: form.deadline || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertEntity(s, "goals", item));
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
        title="Metas"
        description="Acompanhe o progresso rumo aos seus objetivos."
        action={<Button onClick={openCreate}>Nova meta</Button>}
      />

      {snapshot.goals.length === 0 ? (
        <EmptyState
          title="Ainda não há metas"
          description="Defina um objetivo — reserva, viagem, imóvel — para acompanhar o progresso."
          action={<Button onClick={openCreate}>Criar meta</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {snapshot.goals.map((goal) => {
            const progress = goalProgress(goal);
            const pct = Math.round(progress * 100);
            const insight = smartGoalInsight(goal);
            return (
              <li key={goal.id} className="surface-panel p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{goal.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      <Money value={goal.currentAmount} /> /{" "}
                      <Money value={goal.targetAmount} />
                      {goal.deadline ? ` · até ${goal.deadline}` : ""}
                    </p>
                    {insight.requiredMonthly !== null && insight.remaining > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Guardar ~{formatBrl(insight.requiredMonthly)}/mês
                        {insight.monthsLeft
                          ? ` por ${insight.monthsLeft} mês(es)`
                          : ""}
                        {" · "}
                        falta {formatBrl(insight.remaining)}
                      </p>
                    )}
                    {insight.remaining <= 0 && (
                      <p className="mt-1 text-sm text-income">Meta atingida</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-2 text-sm font-semibold tabular-nums">
                      {pct}%
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(goal)}
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(goal)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <ProgressBar value={progress} tone="income" />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Reserva de emergência"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor alvo (R$)</Label>
              <Input
                value={form.targetAmount}
                onChange={(e) =>
                  setForm({ ...form, targetAmount: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor atual (R$)</Label>
              <Input
                value={form.currentAmount}
                onChange={(e) =>
                  setForm({ ...form, currentAmount: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo — opcional</Label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
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
          await updateSnapshot((s) =>
            removeEntity(s, "goals", deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
