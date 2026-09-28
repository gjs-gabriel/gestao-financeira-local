"use client";

import { useState } from "react";
import {
  contributeToInvestment,
  createId,
  INVESTMENT_CLASS_LABELS,
  redeemFromInvestment,
  removeInvestmentSynced,
  upsertInvestmentSynced,
  type Investment,
  type InvestmentClass,
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
  amount: "",
  classification: "renda_fixa" as InvestmentClass,
  notes: "",
  institutionId: undefined as string | undefined,
  institutionOther: undefined as string | undefined,
});

export function AplicacoesPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [moveTarget, setMoveTarget] = useState<Investment | null>(null);
  const [moveKind, setMoveKind] = useState<"buy" | "sell">("buy");
  const [moveForm, setMoveForm] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    accountId: "",
    yieldAmount: "",
  });
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<Investment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const accounts = (snapshot.accounts ?? []).filter((a) => a.status === "active");

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Investment) {
    setEditing(item);
    setForm({
      name: item.name,
      amount: String(item.amount).replace(".", ","),
      classification: item.classification,
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
    if (!form.name.trim() || amount < 0) {
      setError("Informe nome e valor válidos");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: Investment = {
        id: editing?.id ?? createId("inv"),
        name: form.name.trim(),
        amount,
        classification: form.classification,
        institutionId: form.institutionId,
        institutionOther: form.institutionOther,
        notes: form.notes.trim() || undefined,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertInvestmentSynced(s, item));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function saveMove() {
    if (!moveTarget) return;
    setError(null);
    const amount = parseMoneyInput(moveForm.amount);
    if (amount <= 0) {
      setError("Informe um valor válido");
      return;
    }
    setBusy(true);
    try {
      await updateSnapshot((s) =>
        moveKind === "buy"
          ? contributeToInvestment(s, {
              investmentId: moveTarget.id,
              amount,
              date: moveForm.date,
              accountId: moveForm.accountId || undefined,
            })
          : redeemFromInvestment(s, {
              investmentId: moveTarget.id,
              amount,
              date: moveForm.date,
              accountId: moveForm.accountId || undefined,
              yieldAmount: moveForm.yieldAmount
                ? parseMoneyInput(moveForm.yieldAmount)
                : undefined,
            }),
      );
      setMoveTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Aplicações"
        description="Saldo, aportes e resgates (aporte não é despesa)."
        action={<Button onClick={openCreate}>Nova aplicação</Button>}
      />

      {snapshot.investments.length === 0 ? (
        <EmptyState
          title="Nenhuma aplicação"
          description="Cadastre CDB, ações, FIIs e outros ativos para ver o patrimônio."
          action={<Button onClick={openCreate}>Adicionar aplicação</Button>}
        />
      ) : (
        <div className="space-y-2">
          {snapshot.investments.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border/60 bg-card/40 px-4"
            >
              <EntityRow
                title={item.name}
                subtitle={INVESTMENT_CLASS_LABELS[item.classification]}
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
              <div className="flex gap-2 border-t border-border/40 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMoveTarget(item);
                    setMoveKind("buy");
                    setMoveForm({
                      amount: "",
                      date: new Date().toISOString().slice(0, 10),
                      accountId: accounts[0]?.id ?? "",
                      yieldAmount: "",
                    });
                    setError(null);
                  }}
                >
                  Aporte
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMoveTarget(item);
                    setMoveKind("sell");
                    setMoveForm({
                      amount: "",
                      date: new Date().toISOString().slice(0, 10),
                      accountId: accounts[0]?.id ?? "",
                      yieldAmount: "",
                    });
                    setError(null);
                  }}
                >
                  Resgate
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar aplicação" : "Nova aplicação"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Tesouro Selic"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Classificação</Label>
              <Select
                value={form.classification}
                onValueChange={(v) => {
                  if (!v) return;
                  setForm({ ...form, classification: v as InvestmentClass });
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) =>
                      value
                        ? (INVESTMENT_CLASS_LABELS[value as InvestmentClass] ??
                          value)
                        : "Selecione"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(INVESTMENT_CLASS_LABELS) as InvestmentClass[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {INVESTMENT_CLASS_LABELS[k]}
                    </SelectItem>
                  ))}
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
              <Label>Saldo atual (R$)</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                inputMode="decimal"
                placeholder="10000,00"
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

      <Dialog open={!!moveTarget} onOpenChange={(v) => !v && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moveKind === "buy" ? "Aporte" : "Resgate"} · {moveTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                value={moveForm.amount}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, amount: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={moveForm.date}
                onChange={(e) =>
                  setMoveForm({ ...moveForm, date: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select
                value={moveForm.accountId || "_none"}
                onValueChange={(v) => {
                  if (!v || v === "_none") return;
                  setMoveForm({ ...moveForm, accountId: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string | null) =>
                      accounts.find((a) => a.id === v)?.name ?? "Conta"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {moveKind === "sell" && (
              <div className="space-y-1.5">
                <Label>Rendimento (opcional)</Label>
                <Input
                  value={moveForm.yieldAmount}
                  onChange={(e) =>
                    setMoveForm({ ...moveForm, yieldAmount: e.target.value })
                  }
                  inputMode="decimal"
                  placeholder="Só a parte que é lucro"
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={saveMove} disabled={busy}>
              Confirmar
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
            removeInvestmentSynced(s, deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
