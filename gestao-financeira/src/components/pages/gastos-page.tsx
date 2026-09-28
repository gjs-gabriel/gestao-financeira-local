"use client";

import { useState } from "react";
import {
  createId,
  FREQUENCY_LABELS,
  normalizeToMonthly,
  installmentIndexAt,
  monthLabel,
  formatBrl,
  removeInstallmentSynced,
  removeOneTimeExpenseSynced,
  removeRecurringExpenseSynced,
  upsertInstallmentSynced,
  upsertOneTimeExpenseSynced,
  upsertRecurringExpenseSynced,
  type InstallmentExpense,
  type OneTimeExpense,
  type RecurrenceFrequency,
  type RecurringExpense,
} from "@/domain";
import { useVault } from "@/lib/vault-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function GastosPage() {
  const { snapshot, updateSnapshot } = useVault();
  const [tab, setTab] = useState("recorrentes");

  // Recurring form state
  const [recOpen, setRecOpen] = useState(false);
  const [recEdit, setRecEdit] = useState<RecurringExpense | null>(null);
  const [recForm, setRecForm] = useState({
    name: "",
    amount: "",
    frequency: "monthly" as RecurrenceFrequency,
    categoryId: "",
    notes: "",
    institutionId: undefined as string | undefined,
    institutionOther: undefined as string | undefined,
  });
  const [recDelete, setRecDelete] = useState<RecurringExpense | null>(null);

  // One-time form state
  const [otOpen, setOtOpen] = useState(false);
  const [otEdit, setOtEdit] = useState<OneTimeExpense | null>(null);
  const [otForm, setOtForm] = useState({
    name: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    categoryId: "",
    notes: "",
    institutionId: undefined as string | undefined,
    institutionOther: undefined as string | undefined,
  });
  const [otDelete, setOtDelete] = useState<OneTimeExpense | null>(null);

  const [pxOpen, setPxOpen] = useState(false);
  const [pxEdit, setPxEdit] = useState<InstallmentExpense | null>(null);
  const [pxForm, setPxForm] = useState({
    name: "",
    amount: "",
    totalInstallments: "2",
    startDate: new Date().toISOString().slice(0, 10),
    categoryId: "",
    notes: "",
    institutionId: undefined as string | undefined,
    institutionOther: undefined as string | undefined,
  });
  const [pxDelete, setPxDelete] = useState<InstallmentExpense | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;

  const expenseCats = snapshot.categories.filter(
    (c) => c.kind === "expense" || c.kind === "general",
  );

  function catName(id?: string) {
    if (!id) return "Sem categoria";
    return snapshot!.categories.find((c) => c.id === id)?.name ?? "Categoria";
  }

  async function saveRecurring() {
    setError(null);
    const amount = parseMoneyInput(recForm.amount);
    if (!recForm.name.trim() || amount <= 0) {
      setError("Informe nome e valor válidos");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: RecurringExpense = {
        id: recEdit?.id ?? createId("rex"),
        name: recForm.name.trim(),
        amount,
        frequency: recForm.frequency,
        categoryId: recForm.categoryId || undefined,
        notes: recForm.notes.trim() || undefined,
        institutionId: recForm.institutionId,
        institutionOther: recForm.institutionOther,
        createdAt: recEdit?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertRecurringExpenseSynced(s, item));
      setRecOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  function installmentSubtitle(item: InstallmentExpense) {
    const today = new Date();
    const index = installmentIndexAt(
      item,
      today.getFullYear(),
      today.getMonth() + 1,
    );
    const start = item.startDate.slice(0, 7).split("-");
    const startLabel =
      start.length === 2
        ? monthLabel(Number(start[0]), Number(start[1]))
        : item.startDate;
    const progress =
      index === null
        ? item.startDate > today.toISOString().slice(0, 10)
          ? "ainda não começou"
          : "quitado"
        : `parcela ${index + 1}/${item.totalInstallments}`;
    return `${progress} · ${item.totalInstallments}x desde ${startLabel} · ${catName(item.categoryId)} · total ${formatBrl(item.installmentAmount * item.totalInstallments)}`;
  }

  async function saveInstallment() {
    setError(null);
    const amount = parseMoneyInput(pxForm.amount);
    const count = Number.parseInt(pxForm.totalInstallments, 10);
    if (!pxForm.name.trim() || amount <= 0 || !Number.isInteger(count) || count < 2) {
      setError("Informe nome, valor da parcela e pelo menos 2 parcelas");
      return;
    }
    if (!pxForm.startDate) {
      setError("Informe a data da primeira parcela");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: InstallmentExpense = {
        id: pxEdit?.id ?? createId("px"),
        name: pxForm.name.trim(),
        installmentAmount: amount,
        totalInstallments: count,
        startDate: pxForm.startDate,
        categoryId: pxForm.categoryId || undefined,
        notes: pxForm.notes.trim() || undefined,
        institutionId: pxForm.institutionId,
        institutionOther: pxForm.institutionOther,
        createdAt: pxEdit?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertInstallmentSynced(s, item));
      setPxOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function saveOneTime() {
    setError(null);
    const amount = parseMoneyInput(otForm.amount);
    if (!otForm.name.trim() || amount <= 0 || !otForm.date) {
      setError("Informe nome, valor e data");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const item: OneTimeExpense = {
        id: otEdit?.id ?? createId("otx"),
        name: otForm.name.trim(),
        amount,
        date: otForm.date,
        categoryId: otForm.categoryId || undefined,
        notes: otForm.notes.trim() || undefined,
        institutionId: otForm.institutionId,
        institutionOther: otForm.institutionOther,
        createdAt: otEdit?.createdAt ?? now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertOneTimeExpenseSynced(s, item));
      setOtOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Gastos"
        description="Acompanhe para onde seu dinheiro está indo."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="recorrentes">Recorrentes</TabsTrigger>
          <TabsTrigger value="pontuais">Pontuais</TabsTrigger>
          <TabsTrigger value="parcelados">Parcelados</TabsTrigger>
        </TabsList>

        <TabsContent value="recorrentes" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setRecEdit(null);
                setRecForm({
                  name: "",
                  amount: "",
                  frequency: "monthly",
                  categoryId: "",
                  notes: "",
                  institutionId: undefined,
                  institutionOther: undefined,
                });
                setError(null);
                setRecOpen(true);
              }}
            >
              Novo recorrente
            </Button>
          </div>
          {snapshot.recurringExpenses.length === 0 ? (
            <EmptyState
              title="Ainda não há gastos recorrentes"
              description="Adicione aluguel, assinaturas e contas fixas para entender o comprometimento mensal."
            />
          ) : (
            <div className="border-t border-border/40">
              {snapshot.recurringExpenses.map((item) => (
                <EntityRow
                  key={item.id}
                  title={item.name}
                  subtitle={`${FREQUENCY_LABELS[item.frequency]} · ${catName(item.categoryId)} · ~${formatBrl(normalizeToMonthly(item.amount, item.frequency))}/mês`}
                  amount={item.amount}
                  badge={
                    <InstitutionBadge
                      institutionId={item.institutionId}
                      institutionOther={item.institutionOther}
                      institutions={snapshot.institutions}
                    />
                  }
                  onEdit={() => {
                    setRecEdit(item);
                    setRecForm({
                      name: item.name,
                      amount: String(item.amount).replace(".", ","),
                      frequency: item.frequency,
                      categoryId: item.categoryId ?? "",
                      notes: item.notes ?? "",
                      institutionId: item.institutionId,
                      institutionOther: item.institutionOther,
                    });
                    setError(null);
                    setRecOpen(true);
                  }}
                  onDelete={() => setRecDelete(item)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pontuais" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setOtEdit(null);
                setOtForm({
                  name: "",
                  amount: "",
                  date: new Date().toISOString().slice(0, 10),
                  categoryId: "",
                  notes: "",
                  institutionId: undefined,
                  institutionOther: undefined,
                });
                setError(null);
                setOtOpen(true);
              }}
            >
              Novo pontual
            </Button>
          </div>
          {snapshot.oneTimeExpenses.length === 0 ? (
            <EmptyState
              title="Ainda não há gastos aqui"
              description="Adicione seu primeiro gasto para começar a entender para onde seu dinheiro está indo."
            />
          ) : (
            <div className="border-t border-border/40">
              {[...snapshot.oneTimeExpenses]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((item) => (
                  <EntityRow
                    key={item.id}
                    title={item.name}
                    subtitle={`${item.date} · ${catName(item.categoryId)}`}
                    amount={item.amount}
                    badge={
                      <InstitutionBadge
                        institutionId={item.institutionId}
                        institutionOther={item.institutionOther}
                        institutions={snapshot.institutions}
                      />
                    }
                    onEdit={() => {
                      setOtEdit(item);
                      setOtForm({
                        name: item.name,
                        amount: String(item.amount).replace(".", ","),
                        date: item.date,
                        categoryId: item.categoryId ?? "",
                        notes: item.notes ?? "",
                        institutionId: item.institutionId,
                        institutionOther: item.institutionOther,
                      });
                      setError(null);
                      setOtOpen(true);
                    }}
                    onDelete={() => setOtDelete(item)}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="parcelados" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setPxEdit(null);
                setPxForm({
                  name: "",
                  amount: "",
                  totalInstallments: "2",
                  startDate: new Date().toISOString().slice(0, 10),
                  categoryId: "",
                  notes: "",
                  institutionId: undefined,
                  institutionOther: undefined,
                });
                setError(null);
                setPxOpen(true);
              }}
            >
              Novo parcelado
            </Button>
          </div>
          {(snapshot.installmentExpenses ?? []).length === 0 ? (
            <EmptyState
              title="Ainda não há parcelas"
              description="Cadastre compras parceladas para ver o compromisso mês a mês."
            />
          ) : (
            <div className="border-t border-border/40">
              {snapshot.installmentExpenses.map((item) => (
                <EntityRow
                  key={item.id}
                  title={item.name}
                  subtitle={installmentSubtitle(item)}
                  amount={item.installmentAmount}
                  badge={
                    <InstitutionBadge
                      institutionId={item.institutionId}
                      institutionOther={item.institutionOther}
                      institutions={snapshot.institutions}
                    />
                  }
                  onEdit={() => {
                    setPxEdit(item);
                    setPxForm({
                      name: item.name,
                      amount: String(item.installmentAmount).replace(".", ","),
                      totalInstallments: String(item.totalInstallments),
                      startDate: item.startDate,
                      categoryId: item.categoryId ?? "",
                      notes: item.notes ?? "",
                      institutionId: item.institutionId,
                      institutionOther: item.institutionOther,
                    });
                    setError(null);
                    setPxOpen(true);
                  }}
                  onDelete={() => setPxDelete(item)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Recurring dialog */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {recEdit ? "Editar recorrente" : "Novo gasto recorrente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={recForm.name}
                onChange={(e) =>
                  setRecForm({ ...recForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                value={recForm.amount}
                onChange={(e) =>
                  setRecForm({ ...recForm, amount: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select
                value={recForm.frequency}
                onValueChange={(v) => {
                  if (!v) return;
                  setRecForm({
                    ...recForm,
                    frequency: v as RecurrenceFrequency,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {FREQUENCY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={recForm.categoryId || "_none"}
                onValueChange={(v) => {
                  if (v == null) return;
                  setRecForm({
                    ...recForm,
                    categoryId: v === "_none" ? "" : v,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
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
            <InstitutionSelect
              institutions={snapshot.institutions}
              institutionId={recForm.institutionId}
              institutionOther={recForm.institutionOther}
              onChange={(inst) => setRecForm({ ...recForm, ...inst })}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRecurring} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time dialog */}
      <Dialog open={otOpen} onOpenChange={setOtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {otEdit ? "Editar pontual" : "Novo gasto pontual"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={otForm.name}
                onChange={(e) => setOtForm({ ...otForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                value={otForm.amount}
                onChange={(e) =>
                  setOtForm({ ...otForm, amount: e.target.value })
                }
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={otForm.date}
                onChange={(e) => setOtForm({ ...otForm, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={otForm.categoryId || "_none"}
                onValueChange={(v) => {
                  if (v == null) return;
                  setOtForm({
                    ...otForm,
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
            <InstitutionSelect
              institutions={snapshot.institutions}
              institutionId={otForm.institutionId}
              institutionOther={otForm.institutionOther}
              onChange={(inst) => setOtForm({ ...otForm, ...inst })}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveOneTime} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pxOpen} onOpenChange={setPxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pxEdit ? "Editar parcelado" : "Novo gasto parcelado"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={pxForm.name}
                onChange={(e) => setPxForm({ ...pxForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor da parcela</Label>
                <Input
                  value={pxForm.amount}
                  onChange={(e) =>
                    setPxForm({ ...pxForm, amount: e.target.value })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nº de parcelas</Label>
                <Input
                  value={pxForm.totalInstallments}
                  onChange={(e) =>
                    setPxForm({ ...pxForm, totalInstallments: e.target.value })
                  }
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Primeira parcela</Label>
              <Input
                type="date"
                value={pxForm.startDate}
                onChange={(e) =>
                  setPxForm({ ...pxForm, startDate: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={pxForm.categoryId || "_none"}
                onValueChange={(v) => {
                  if (v == null) return;
                  setPxForm({
                    ...pxForm,
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
            <InstitutionSelect
              institutions={snapshot.institutions}
              institutionId={pxForm.institutionId}
              institutionOther={pxForm.institutionOther}
              onChange={(inst) => setPxForm({ ...pxForm, ...inst })}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPxOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveInstallment} disabled={busy}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!recDelete}
        onOpenChange={(v) => !v && setRecDelete(null)}
        title={recDelete?.name ?? ""}
        onConfirm={async () => {
          if (!recDelete) return;
          await updateSnapshot((s) =>
            removeRecurringExpenseSynced(s, recDelete.id),
          );
        }}
      />
      <ConfirmDeleteDialog
        open={!!otDelete}
        onOpenChange={(v) => !v && setOtDelete(null)}
        title={otDelete?.name ?? ""}
        onConfirm={async () => {
          if (!otDelete) return;
          await updateSnapshot((s) =>
            removeOneTimeExpenseSynced(s, otDelete.id),
          );
        }}
      />
      <ConfirmDeleteDialog
        open={!!pxDelete}
        onOpenChange={(v) => !v && setPxDelete(null)}
        title={pxDelete?.name ?? ""}
        onConfirm={async () => {
          if (!pxDelete) return;
          await updateSnapshot((s) =>
            removeInstallmentSynced(s, pxDelete.id),
          );
        }}
      />
    </div>
  );
}
