"use client";

import { useState } from "react";
import {
  cardLimitUsage,
  createId,
  formatBrl,
  invoiceAmount,
  openInvoicesForCard,
  payInvoice,
  recordCardPurchase,
  removeEntity,
  upsertEntity,
  type CreditCard,
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

export function CartoesPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [activeCard, setActiveCard] = useState<CreditCard | null>(null);
  const [form, setForm] = useState({
    name: "",
    limit: "",
    closingDay: "10",
    dueDay: "17",
    paymentAccountId: "",
    institutionId: undefined as string | undefined,
    institutionOther: undefined as string | undefined,
  });
  const [purchase, setPurchase] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    categoryId: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<CreditCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const cards = snapshot.creditCards ?? [];
  const accounts = (snapshot.accounts ?? []).filter((a) => a.status === "active");
  const expenseCats = snapshot.categories.filter(
    (c) => c.kind === "expense" || c.kind === "general",
  );

  async function saveCard() {
    setError(null);
    const limit = parseMoneyInput(form.limit);
    const closingDay = Number(form.closingDay);
    const dueDay = Number(form.dueDay);
    if (!form.name.trim() || limit <= 0 || closingDay < 1 || dueDay < 1) {
      setError("Informe nome, limite e dias válidos");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: CreditCard = {
        id: editing?.id ?? createId("card"),
        name: form.name.trim(),
        limit,
        closingDay,
        dueDay,
        paymentAccountId: form.paymentAccountId || undefined,
        institutionId: form.institutionId,
        institutionOther: form.institutionOther,
        status: "active",
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertEntity(s, "creditCards", item));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function savePurchase() {
    setError(null);
    if (!activeCard) return;
    const amount = parseMoneyInput(purchase.amount);
    if (!purchase.description.trim() || amount <= 0) {
      setError("Informe descrição e valor");
      return;
    }
    setBusy(true);
    try {
      await updateSnapshot((s) =>
        recordCardPurchase(s, {
          cardId: activeCard.id,
          amount,
          date: purchase.date,
          description: purchase.description.trim(),
          categoryId: purchase.categoryId || undefined,
        }),
      );
      setPurchaseOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cartões"
        description="Compras entram na fatura; pagar a fatura não é uma nova despesa."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setForm({
                name: "",
                limit: "",
                closingDay: "10",
                dueDay: "17",
                paymentAccountId: accounts[0]?.id ?? "",
                institutionId: undefined,
                institutionOther: undefined,
              });
              setError(null);
              setOpen(true);
            }}
          >
            Novo cartão
          </Button>
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum cartão"
          description="Cadastre um cartão para registrar compras e faturas."
        />
      ) : (
        <div className="space-y-4">
          {cards.map((card) => {
            const usage = cardLimitUsage(card, snapshot);
            const invoices = openInvoicesForCard(snapshot, card.id);
            return (
              <section
                key={card.id}
                className="rounded-xl border border-border/60 bg-card/40 p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-heading text-lg font-medium">{card.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      Fecha dia {card.closingDay} · vence dia {card.dueDay}
                    </p>
                    <InstitutionBadge
                      institutionId={card.institutionId}
                      institutionOther={card.institutionOther}
                      institutions={snapshot.institutions}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveCard(card);
                        setPurchase({
                          amount: "",
                          date: new Date().toISOString().slice(0, 10),
                          description: "",
                          categoryId: "",
                        });
                        setError(null);
                        setPurchaseOpen(true);
                      }}
                    >
                      Compra
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(card);
                        setForm({
                          name: card.name,
                          limit: String(card.limit).replace(".", ","),
                          closingDay: String(card.closingDay),
                          dueDay: String(card.dueDay),
                          paymentAccountId: card.paymentAccountId ?? "",
                          institutionId: card.institutionId,
                          institutionOther: card.institutionOther,
                        });
                        setOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(card)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
                <p className="mb-3 text-sm">
                  Limite usado {formatBrl(usage.used)} de {formatBrl(usage.limit)}{" "}
                  · disponível {formatBrl(usage.available)}
                </p>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[#B45309]"
                    style={{
                      width: `${Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100)}%`,
                    }}
                  />
                </div>
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem fatura aberta.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {invoices.map((inv) => {
                      const amount = invoiceAmount(
                        inv,
                        snapshot.transactions ?? [],
                      );
                      return (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2"
                        >
                          <span>
                            Fatura {inv.periodKey} · vence {inv.dueDate} ·{" "}
                            {formatBrl(amount)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await updateSnapshot((s) => payInvoice(s, inv.id));
                            }}
                          >
                            Pagar
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cartão" : "Novo cartão"}</DialogTitle>
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
              <Label>Limite</Label>
              <Input
                value={form.limit}
                onChange={(e) => setForm({ ...form, limit: e.target.value })}
                inputMode="decimal"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fechamento (dia)</Label>
                <Input
                  value={form.closingDay}
                  onChange={(e) =>
                    setForm({ ...form, closingDay: e.target.value })
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento (dia)</Label>
                <Input
                  value={form.dueDay}
                  onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conta de pagamento</Label>
              <Select
                value={form.paymentAccountId || "_none"}
                onValueChange={(v) => {
                  if (v == null) return;
                  setForm({
                    ...form,
                    paymentAccountId: v === "_none" ? "" : v,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) => {
                      if (!value || value === "_none") return "Selecionar";
                      return (
                        accounts.find((a) => a.id === value)?.name ?? value
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Selecionar</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCard} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compra · {activeCard?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                value={purchase.description}
                onChange={(e) =>
                  setPurchase({ ...purchase, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <Input
                  value={purchase.amount}
                  onChange={(e) =>
                    setPurchase({ ...purchase, amount: e.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={purchase.date}
                  onChange={(e) =>
                    setPurchase({ ...purchase, date: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={purchase.categoryId || "_none"}
                onValueChange={(v) => {
                  if (v == null) return;
                  setPurchase({
                    ...purchase,
                    categoryId: v === "_none" ? "" : v,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={savePurchase} disabled={busy}>
              Registrar
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
            removeEntity(s, "creditCards", deleteTarget.id),
          );
        }}
      />
    </div>
  );
}
