"use client";

import { useState } from "react";
import {
  createId,
  removeEntity,
  upsertEntity,
  type CategorizationRule,
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
import { EmptyState, PageHeader } from "@/components/ui-helpers";
import { ConfirmDeleteDialog, EntityRow } from "@/components/entity-row";

export function RegrasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategorizationRule | null>(null);
  const [form, setForm] = useState({
    name: "",
    contains: "",
    categoryId: "",
    priority: "10",
  });
  const [deleteTarget, setDeleteTarget] = useState<CategorizationRule | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const rules = [...(snapshot.categorizationRules ?? [])].sort(
    (a, b) => a.priority - b.priority,
  );
  const cats = snapshot.categories.filter(
    (c) => c.kind === "expense" || c.kind === "income" || c.kind === "general",
  );

  async function save() {
    setError(null);
    if (!form.name.trim() || !form.contains.trim() || !form.categoryId) {
      setError("Preencha nome, texto e categoria");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: CategorizationRule = {
        id: editing?.id ?? createId("rulecat"),
        name: form.name.trim(),
        matchField: "description",
        contains: form.contains.trim(),
        categoryId: form.categoryId,
        priority: Number(form.priority) || 10,
        active: true,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) =>
        upsertEntity(s, "categorizationRules", item),
      );
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
        title="Regras"
        description="Categorização automática na importação (ex.: UBER → Transporte)."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ name: "", contains: "", categoryId: "", priority: "10" });
              setError(null);
              setOpen(true);
            }}
          >
            Nova regra
          </Button>
        }
      />

      {rules.length === 0 ? (
        <EmptyState
          title="Sem regras"
          description="Crie regras para acelerar a importação de extratos."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 px-4">
          {rules.map((rule) => {
            const cat =
              snapshot.categories.find((c) => c.id === rule.categoryId)?.name ??
              "?";
            return (
              <EntityRow
                key={rule.id}
                title={rule.name}
                subtitle={`Se descrição contém “${rule.contains}” → ${cat} · prioridade ${rule.priority}${rule.active ? "" : " · inativa"}`}
                onEdit={() => {
                  setEditing(rule);
                  setForm({
                    name: rule.name,
                    contains: rule.contains,
                    categoryId: rule.categoryId,
                    priority: String(rule.priority),
                  });
                  setOpen(true);
                }}
                onDelete={() => setDeleteTarget(rule)}
              />
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Uber"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Texto na descrição</Label>
              <Input
                value={form.contains}
                onChange={(e) => setForm({ ...form, contains: e.target.value })}
                placeholder="UBER"
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
                      cats.find((c) => c.id === v)?.name ?? "Categoria"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade (menor = primeiro)</Label>
              <Input
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                inputMode="numeric"
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
            removeEntity(s, "categorizationRules", deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
