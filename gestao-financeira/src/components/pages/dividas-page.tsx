"use client";

import { useState } from "react";
import {
  compareDebtPlans,
  createId,
  formatBrl,
  type Debt,
} from "@/domain";
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
import { EmptyState, PageHeader, parseMoneyInput } from "@/components/ui-helpers";
import { ConfirmDeleteDialog, EntityRow } from "@/components/entity-row";

export function DividasPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [simDebt, setSimDebt] = useState<Debt | null>(null);
  const [extra, setExtra] = useState("100");
  const [form, setForm] = useState({
    name: "",
    balance: "",
    originalAmount: "",
    installmentAmount: "",
    remainingInstallments: "",
    interestRate: "",
    dueDate: "",
    notes: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<Debt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      balance: "",
      originalAmount: "",
      installmentAmount: "",
      remainingInstallments: "",
      interestRate: "",
      dueDate: "",
      notes: "",
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(item: Debt) {
    setEditing(item);
    setForm({
      name: item.name,
      balance: String(item.balance).replace(".", ","),
      originalAmount:
        item.originalAmount !== undefined
          ? String(item.originalAmount).replace(".", ",")
          : "",
      installmentAmount:
        item.installmentAmount !== undefined
          ? String(item.installmentAmount).replace(".", ",")
          : "",
      remainingInstallments:
        item.remainingInstallments !== undefined
          ? String(item.remainingInstallments)
          : "",
      interestRate:
        item.interestRate !== undefined ? String(item.interestRate) : "",
      dueDate: item.dueDate ?? "",
      notes: item.notes ?? "",
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    const balance = parseMoneyInput(form.balance);
    if (!form.name.trim() || balance < 0) {
      setError("Informe nome e saldo válidos");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: Debt = {
        id: editing?.id ?? createId("debt"),
        name: form.name.trim(),
        balance,
        originalAmount: form.originalAmount
          ? parseMoneyInput(form.originalAmount)
          : undefined,
        installmentAmount: form.installmentAmount
          ? parseMoneyInput(form.installmentAmount)
          : undefined,
        remainingInstallments: form.remainingInstallments
          ? Number.parseInt(form.remainingInstallments, 10)
          : undefined,
        interestRate: form.interestRate
          ? Number(form.interestRate.replace(",", "."))
          : undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertEntity(s, "debts", item));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  const comparison =
    simDebt &&
    compareDebtPlans(simDebt, Math.max(0, parseMoneyInput(extra)));

  return (
    <div>
      <PageHeader
        title="Dívidas"
        description="Saldo, parcela e simulação de pagamento extra."
        action={<Button onClick={openCreate}>Nova dívida</Button>}
      />

      {snapshot.debts.length === 0 ? (
        <EmptyState
          title="Nenhuma dívida"
          description="Empréstimos, financiamentos e saldos a pagar."
        />
      ) : (
        <div className="space-y-3">
          {snapshot.debts.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border/60 bg-card/40 px-4"
            >
              <EntityRow
                title={item.name}
                subtitle={[
                  item.interestRate != null ? `${item.interestRate}% a.a.` : null,
                  item.installmentAmount != null
                    ? `parcela ${formatBrl(item.installmentAmount)}`
                    : null,
                  item.dueDate ? `vence ${item.dueDate}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                amount={item.balance}
                onEdit={() => openEdit(item)}
                onDelete={() => setDeleteTarget(item)}
              />
              <div className="border-t border-border/40 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSimDebt(item);
                    setExtra("100");
                  }}
                >
                  Simular pagamento extra
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {simDebt && comparison && (
        <section className="mt-6 rounded-xl border border-border/60 bg-card/40 p-4">
          <h2 className="mb-3 font-heading text-lg font-medium">
            Simulação · {simDebt.name}
          </h2>
          <div className="mb-3 max-w-xs space-y-1.5">
            <Label>Extra mensal (R$)</Label>
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <ul className="space-y-1 text-sm">
            <li>
              Sem extra: {comparison.base.months} meses · juros{" "}
              {formatBrl(comparison.base.totalInterest)}
            </li>
            <li>
              Com extra: {comparison.withExtra.months} meses · juros{" "}
              {formatBrl(comparison.withExtra.totalInterest)}
            </li>
            <li className="font-medium text-emerald-800">
              Economia: {comparison.monthsSaved} mês(es) ·{" "}
              {formatBrl(comparison.interestSaved)} em juros
            </li>
          </ul>
          <Button
            className="mt-3"
            variant="ghost"
            size="sm"
            onClick={() => setSimDebt(null)}
          >
            Fechar
          </Button>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar dívida" : "Nova dívida"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Saldo atual</Label>
                <Input
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor original</Label>
                <Input
                  value={form.originalAmount}
                  onChange={(e) =>
                    setForm({ ...form, originalAmount: e.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Parcela mensal</Label>
                <Input
                  value={form.installmentAmount}
                  onChange={(e) =>
                    setForm({ ...form, installmentAmount: e.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Parcelas restantes</Label>
                <Input
                  value={form.remainingInstallments}
                  onChange={(e) =>
                    setForm({ ...form, remainingInstallments: e.target.value })
                  }
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Taxa anual (%)</Label>
                <Input
                  value={form.interestRate}
                  onChange={(e) =>
                    setForm({ ...form, interestRate: e.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
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
            removeEntity(s, "debts", deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
