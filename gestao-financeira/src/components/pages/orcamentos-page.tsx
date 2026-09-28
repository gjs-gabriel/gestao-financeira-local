"use client";

import { useState } from "react";
import {
  budgetProgressForMonth,
  createId,
  formatBrl,
  removeEntity,
  upsertEntity,
  type Budget,
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
import { ConfirmDeleteDialog } from "@/components/entity-row";

export function OrcamentosPage() {
  const { snapshot, updateSnapshot } = useVault();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState({ name: "", categoryId: "", limit: "" });
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const progress = budgetProgressForMonth(
    snapshot,
    now.getFullYear(),
    now.getMonth() + 1,
  );
  const expenseCats = snapshot.categories.filter(
    (c) => c.kind === "expense" || c.kind === "general",
  );

  async function save() {
    setError(null);
    const limitAmount = parseMoneyInput(form.limit);
    if (!form.name.trim() || !form.categoryId || limitAmount <= 0) {
      setError("Informe nome, categoria e limite");
      return;
    }
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      const item: Budget = {
        id: editing?.id ?? createId("bud"),
        name: form.name.trim(),
        categoryId: form.categoryId,
        limitAmount,
        active: true,
        createdAt: editing?.createdAt ?? ts,
        updatedAt: ts,
      };
      await updateSnapshot((s) => upsertEntity(s, "budgets", item));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        description="Limite mensal por categoria — alerta a partir de 80%."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ name: "", categoryId: "", limit: "" });
              setError(null);
              setOpen(true);
            }}
          >
            Novo orçamento
          </Button>
        }
      />

      {progress.length === 0 ? (
        <EmptyState
          title="Sem orçamentos"
          description="Defina um limite para Alimentação, Lazer, etc."
        />
      ) : (
        <ul className="space-y-4">
          {progress.map((row) => {
            const pct = Math.min(100, Math.round(row.ratio * 100));
            const tone =
              row.status === "over"
                ? "bg-rose-700"
                : row.status === "near"
                  ? "bg-amber-600"
                  : "bg-[#0F766E]";
            const cat =
              snapshot.categories.find((c) => c.id === row.budget.categoryId)
                ?.name ?? "Categoria";
            return (
              <li
                key={row.budget.id}
                className="rounded-xl border border-border/60 bg-card/40 p-4"
              >
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <button
                    type="button"
                    className="text-left font-medium"
                    onClick={() => {
                      setEditing(row.budget);
                      setForm({
                        name: row.budget.name,
                        categoryId: row.budget.categoryId,
                        limit: String(row.budget.limitAmount).replace(".", ","),
                      });
                      setOpen(true);
                    }}
                  >
                    {row.budget.name}
                    <span className="text-muted-foreground"> · {cat}</span>
                  </button>
                  <span className="tabular-nums text-muted-foreground">
                    {formatBrl(row.spent)} / {formatBrl(row.budget.limitAmount)} ·{" "}
                    {pct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {row.status === "over"
                      ? "Estourado"
                      : row.status === "near"
                        ? "Perto do limite"
                        : `Disponível ${formatBrl(row.remaining)}`}
                  </span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setDeleteTarget(row.budget)}
                  >
                    Excluir
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar orçamento" : "Novo orçamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.categoryId || "_none"}
                onValueChange={(v) => {
                  if (!v || v === "_none") return;
                  setForm({ ...form, categoryId: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string | null) =>
                      expenseCats.find((c) => c.id === v)?.name ?? "Categoria"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Limite mensal</Label>
              <Input
                value={form.limit}
                onChange={(e) => setForm({ ...form, limit: e.target.value })}
                inputMode="decimal"
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
            removeEntity(s, "budgets", deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
