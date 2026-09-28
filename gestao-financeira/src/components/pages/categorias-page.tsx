"use client";

import { useState } from "react";
import {
  CATEGORY_KIND_LABELS,
  createId,
  type Category,
  type CategoryKind,
} from "@/domain";
import { removeEntity, upsertEntity } from "@/domain/snapshot";
import { useVault } from "@/lib/vault-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export function CategoriasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({
    name: "",
    kind: "expense" as CategoryKind,
    color: "#0F766E",
  });
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  function openCreate() {
    setEditing(null);
    setForm({ name: "", kind: "expense", color: "#0F766E" });
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Category) {
    setEditing(item);
    setForm({
      name: item.name,
      kind: item.kind,
      color: item.color ?? "#0F766E",
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("Informe o nome");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: Category = {
        id: editing?.id ?? createId("cat"),
        name: form.name.trim(),
        kind: form.kind,
        color: form.color,
        createdAt: editing?.createdAt ?? now,
      };
      await updateSnapshot((s) => upsertEntity(s, "categories", item));
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
        title="Categorias"
        description="Organizam gastos e classificações. Seeds pt-BR já vêm no cofre novo."
        action={<Button onClick={openCreate}>Nova categoria</Button>}
      />

      {snapshot.categories.length === 0 ? (
        <EmptyState
          title="Sem categorias"
          description="Crie categorias para agrupar gastos e aplicações."
          action={<Button onClick={openCreate}>Adicionar</Button>}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 px-4">
          {snapshot.categories.map((item) => (
            <EntityRow
              key={item.id}
              title={item.name}
              subtitle={CATEGORY_KIND_LABELS[item.kind]}
              onEdit={() => openEdit(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {snapshot.categories.slice(0, 8).map((c) => (
          <Badge
            key={c.id}
            variant="secondary"
            style={
              c.color
                ? { borderColor: c.color, borderWidth: 1 }
                : undefined
            }
          >
            {c.name}
          </Badge>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar categoria" : "Nova categoria"}
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
              <Label>Tipo</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => {
                  if (!v) return;
                  setForm({ ...form, kind: v as CategoryKind });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_KIND_LABELS) as CategoryKind[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {CATEGORY_KIND_LABELS[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-20 p-1"
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
            removeEntity(s, "categories", deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
