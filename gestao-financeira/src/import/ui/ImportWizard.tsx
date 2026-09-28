"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatBrl } from "@/domain";
import { useVault } from "@/lib/vault-context";
import { getRuntimeManager } from "@/ai/local/RuntimeManager";
import { buildFinancialTestContext } from "@/ai/local/AnalysisContextBuilder";
import {
  analyzeImportDocument,
  buildFinancialImportDraft,
  commitImport,
  draftCanProceedToConfirm,
  exportDraftCsv,
  getImportSessionManager,
  parseDocument,
  rollbackImport,
  validateImportDraft,
  type ConfidenceLevel,
  type FinancialImportDraft,
  type FinancialImportDraftTxn,
  type ImportRollbackRef,
  type ImportSourceKind,
  type ImportVisualStep,
  type ParsedDocument,
} from "@/import";
import { ImportStepIndicator } from "./ImportStepIndicator";
import { ImportDropzone, ImportFormatCards } from "./ImportDropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FilterId =
  | "all"
  | "attention"
  | "high"
  | "medium"
  | "low"
  | "income"
  | "expense"
  | "excluded";

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const label =
    level === "high"
      ? "Alta confiança"
      : level === "medium"
        ? "Média confiança"
        : "Baixa confiança";
  return (
    <span
      className={cn(
        "text-xs",
        level === "high" && "text-income",
        level === "medium" && "text-expense",
        level === "low" && "text-debt",
      )}
    >
      {level === "high" ? "✓ " : level === "low" ? "⚠ " : ""}
      {label}
    </span>
  );
}

export function ImportWizard() {
  const { snapshot, updateSnapshot, activeProfile, status } = useVault();
  const session = getImportSessionManager();
  const userSessionId = activeProfile
    ? `${activeProfile.id}:${activeProfile.vaultId}`
    : null;

  const [step, setStep] = useState<ImportVisualStep>("document");
  const [pickKind, setPickKind] = useState<ImportSourceKind | "any" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [draft, setDraft] = useState<FinancialImportDraft | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    count: number;
    income: number;
    expense: number;
    skipped: number;
  } | null>(null);
  const [rollbackRef, setRollbackRef] = useState<ImportRollbackRef | null>(
    null,
  );
  const [useAI, setUseAI] = useState(false);

  // Isolamento: lock / troca de usuário
  useEffect(() => {
    if (status !== "unlocked" || !userSessionId) {
      session.clear();
      setParsed(null);
      setDraft(null);
      setStep("document");
      setPickKind(null);
      setConfirmed(false);
      setCommitResult(null);
      setRollbackRef(null);
      return;
    }
    if (
      session.getUserSessionId() &&
      session.getUserSessionId() !== userSessionId
    ) {
      session.clear();
      setParsed(null);
      setDraft(null);
      setStep("document");
    }
  }, [status, userSessionId, session]);

  const categories = snapshot?.categories ?? [];

  const filteredTxns = useMemo(() => {
    if (!draft) return [];
    return draft.transactions.filter((t) => {
      if (filter === "all") return true;
      if (filter === "attention")
        return t.status === "needs_attention" || t.status === "error";
      if (filter === "high") return t.confidence === "high";
      if (filter === "medium") return t.confidence === "medium";
      if (filter === "low") return t.confidence === "low";
      if (filter === "income") return t.type === "income";
      if (filter === "expense") return t.type === "expense";
      if (filter === "excluded") return !t.include;
      return true;
    });
  }, [draft, filter]);

  const summary = useMemo(() => {
    if (!draft) return null;
    const included = draft.transactions.filter((t) => t.include);
    const income = included
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const expense = included
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const high = draft.transactions.filter((t) => t.confidence === "high").length;
    const medium = draft.transactions.filter(
      (t) => t.confidence === "medium",
    ).length;
    const low = draft.transactions.filter((t) => t.confidence === "low").length;
    return {
      total: draft.transactions.length,
      included: included.length,
      income,
      expense,
      high,
      medium,
      low,
      ignored: draft.transactions.filter((t) => !t.include).length,
    };
  }, [draft]);

  const patchTxn = useCallback(
    (id: string, patch: Partial<FinancialImportDraftTxn>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const transactions = prev.transactions.map((t) =>
          t.id === id ? { ...t, ...patch } : t,
        );
        const next = { ...prev, transactions };
        next.validation = validateImportDraft(next);
        session.updateDraft(next);
        return next;
      });
    },
    [session],
  );

  async function processFile(file: File) {
    if (!userSessionId || !snapshot) return;
    setBusy(true);
    setError(null);
    setProgress([]);
    setStep("analysis");
    session.start(userSessionId);

    try {
      setProgress(["Lendo documento…"]);
      const doc = await parseDocument(file);
      if (doc.needsOcr) {
        setError(
          "Este PDF parece conter imagens em vez de texto. Não foi possível ler o conteúdo.",
        );
        setStep("document");
        session.clear();
        return;
      }
      setParsed(doc);
      session.setParsed(doc, file.name);
      setProgress((p) => [
        ...p,
        `Documento lido${doc.pages ? ` · ${doc.pages} página(s)` : ""}`,
        `${doc.rows.length} lançamentos encontrados`,
      ]);

      setProgress((p) => [...p, "Classificando e sugerindo categorias…"]);
      let generate:
        | ((messages: { role: string; content: string }[]) => Promise<string>)
        | undefined;
      if (useAI) {
        try {
          // IA só no runtime local — nunca WebLLM/WebGPU no navegador
          const client = await getRuntimeManager().ensureReady();
          generate = async (messages) => {
            const question =
              messages
                .filter((m) => m.role === "user")
                .map((m) => m.content)
                .join("\n")
                .slice(0, 1200) || "Classifique categorias financeiras.";
            const reply = await client.chat(
              buildFinancialTestContext(),
              question,
              { timeoutMs: 60_000 },
            );
            return reply.text;
          };
        } catch {
          /* segue com regras */
        }
      }

      const ai = await analyzeImportDocument(doc, {
        snapshot,
        useLocalAI: useAI,
        generate,
      });
      setProgress((p) => [
        ...p,
        ai.usedAI
          ? "Sugestões refinadas com IA local"
          : "Sugestões por regras locais",
        "Validações concluídas",
      ]);

      const built = buildFinancialImportDraft({
        parsed: doc,
        ai,
        fileName: file.name,
        userSessionId,
        snapshot,
      });
      setDraft(built);
      session.setDraft(built);
      setStep("review");
      setFilter(built.validation.attentionCount > 0 ? "attention" : "all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar");
      setStep("document");
      session.clear();
    } finally {
      setBusy(false);
    }
  }

  function applyBulkCategory(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || selected.size === 0) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const transactions = prev.transactions.map((t) =>
        selected.has(t.id)
          ? {
              ...t,
              categoryId: cat.id,
              categoryLabel: cat.name,
              status: t.errors.length ? t.status : ("ready" as const),
              warnings: t.warnings.filter((w) => !/categoria/i.test(w)),
            }
          : t,
      );
      const next = { ...prev, transactions };
      next.validation = validateImportDraft(next);
      session.updateDraft(next);
      return next;
    });
  }

  function excludeSelected() {
    setDraft((prev) => {
      if (!prev) return prev;
      const transactions = prev.transactions.map((t) =>
        selected.has(t.id) ? { ...t, include: false, status: "ignored" as const } : t,
      );
      const next = { ...prev, transactions };
      next.validation = validateImportDraft(next);
      session.updateDraft(next);
      return next;
    });
    setSelected(new Set());
  }

  async function onConfirmImport() {
    if (!draft || !snapshot || !userSessionId || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const selectedIds = draft.transactions
        .filter((t) => t.include)
        .map((t) => t.id);
      const { snapshot: next, result, rollback } = commitImport({
        draft,
        snapshot,
        confirmation: {
          confirmed: true,
          checkboxChecked: true,
          selectedIds,
          userSessionId,
        },
        activeUserSessionId: userSessionId,
        vaultUnlocked: status === "unlocked",
      });
      await updateSnapshot(() => next);
      setRollbackRef(rollback);
      setCommitResult({
        count: result.count,
        income: draft.transactions
          .filter((t) => t.include && t.type === "income")
          .reduce((s, t) => s + t.amount, 0),
        expense: draft.transactions
          .filter((t) => t.include && t.type === "expense")
          .reduce((s, t) => s + t.amount, 0),
        skipped: result.skippedDuplicates + result.skippedExcluded,
      });
      setStep("done");
      session.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  async function onUndo() {
    if (!rollbackRef || !snapshot || !userSessionId) return;
    setBusy(true);
    try {
      const next = rollbackImport(snapshot, rollbackRef, userSessionId);
      await updateSnapshot(() => next);
      setRollbackRef(null);
      setCommitResult(null);
      setStep("document");
      setPickKind(null);
      setDraft(null);
      setParsed(null);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desfazer");
    } finally {
      setBusy(false);
    }
  }

  function resetWizard() {
    session.clear();
    setStep("document");
    setPickKind(null);
    setParsed(null);
    setDraft(null);
    setError(null);
    setProgress([]);
    setConfirmed(false);
    setCommitResult(null);
    setSelected(new Set());
  }

  function downloadCsv() {
    if (!draft) return;
    const csv = exportDraftCsv(draft);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clips-import-${draft.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!snapshot || !activeProfile) return null;

  return (
    <div>
      <ImportStepIndicator current={step} />

      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {step === "document" && !pickKind ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-xl font-medium">Importar dados</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Adicione seus lançamentos de forma rápida com o Clips.
            </p>
          </div>
          <ImportFormatCards onPick={setPickKind} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={useAI}
              onCheckedChange={(v) => setUseAI(v === true)}
            />
            Usar IA local para refinar categorias (opcional — download do modelo na
            1ª vez)
          </label>
        </div>
      ) : null}

      {step === "document" && pickKind ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl font-medium">
              Adicionar documento
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setPickKind(null)}>
              Voltar
            </Button>
          </div>
          <ImportDropzone
            acceptKind={pickKind}
            busy={busy}
            onFile={(f) => void processFile(f)}
            error={error}
          />
        </div>
      ) : null}

      {step === "analysis" ? (
        <div className="space-y-4">
          <h2 className="font-heading text-xl font-medium">
            Analisando seu documento
          </h2>
          <ul className="space-y-2 text-sm">
            {progress.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-primary">✓</span>
                {line}
              </li>
            ))}
            {busy ? (
              <li className="text-muted-foreground">Processando…</li>
            ) : null}
          </ul>
          {parsed && !busy ? (
            <div className="space-y-3 border-t border-border/40 pt-4 text-sm">
              <p>Seu documento está pronto para revisão.</p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Lançamentos</dt>
                  <dd className="font-medium">{parsed.rows.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Período</dt>
                  <dd className="font-medium">
                    {parsed.period.start ?? "—"} — {parsed.period.end ?? "—"}
                  </dd>
                </div>
              </dl>
              <Button onClick={() => setStep("review")}>
                Revisar lançamentos
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === "review" && draft && summary ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-xl font-medium">
              Revise seus lançamentos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Encontramos {summary.total} lançamentos. Confira as sugestões
              antes de importar.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span>{summary.high} alta confiança</span>
            <span>{summary.medium} média</span>
            <span>{summary.low} baixa</span>
            {draft.validation.attentionCount > 0 ? (
              <span className="text-expense">
                ⚠ {draft.validation.attentionCount} precisam de atenção
              </span>
            ) : null}
          </div>

          {draft.validation.balanceCheck.applicable ? (
            <p
              className={cn(
                "text-sm",
                draft.validation.balanceCheck.ok
                  ? "text-income"
                  : "text-expense",
              )}
            >
              {draft.validation.balanceCheck.ok
                ? "✓ Valores do extrato conferem"
                : "⚠ Os valores encontrados não fecham com o saldo informado no documento."}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Todos"],
                ["attention", "Pendências"],
                ["high", "Alta"],
                ["medium", "Média"],
                ["low", "Baixa"],
                ["income", "Entradas"],
                ["expense", "Saídas"],
                ["excluded", "Ignorados"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={filter === id ? "default" : "outline"}
                onClick={() => setFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm">
              <span>{selected.size} selecionado(s)</span>
              <Select
                onValueChange={(v) => {
                  if (typeof v === "string" && v.length > 0) {
                    applyBulkCategory(v);
                  }
                }}
              >
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Alterar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={excludeSelected}>
                Excluir selecionados
              </Button>
            </div>
          ) : null}

          <ul className="divide-y divide-border/40 border-t border-border/40">
            {filteredTxns.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={(v) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(t.id);
                        else next.delete(t.id);
                        return next;
                      });
                    }}
                    aria-label={`Selecionar ${t.description}`}
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                    <Input
                      value={t.description}
                      onChange={(e) =>
                        patchTxn(t.id, { description: e.target.value })
                      }
                      className="h-8 max-w-md"
                      aria-label="Descrição"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={t.categoryId ?? "_none"}
                        onValueChange={(v) => {
                          if (!v || v === "_none") {
                            patchTxn(t.id, {
                              categoryId: undefined,
                              categoryLabel: "Outros",
                            });
                            return;
                          }
                          const cat = categories.find((c) => c.id === v);
                          patchTxn(t.id, {
                            categoryId: v,
                            categoryLabel: cat?.name,
                            status:
                              t.errors.length === 0 ? "ready" : t.status,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Outros</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={t.type}
                        onValueChange={(v) => {
                          if (
                            v === "expense" ||
                            v === "income" ||
                            v === "unknown"
                          ) {
                            patchTxn(t.id, {
                              type: v,
                              signedAmount:
                                v === "income" ? t.amount : -t.amount,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Gasto</SelectItem>
                          <SelectItem value="income">Entrada</SelectItem>
                          <SelectItem value="unknown">Revisar</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={t.include}
                          onCheckedChange={(v) =>
                            patchTxn(t.id, {
                              include: v === true,
                              status:
                                v === true
                                  ? t.errors.length
                                    ? "error"
                                    : "ready"
                                  : "ignored",
                            })
                          }
                        />
                        Importar
                      </label>
                    </div>
                    <ConfidenceBadge level={t.confidence} />
                    {t.duplicate ? (
                      <p className="text-xs text-expense">
                        ⚠ Possível lançamento duplicado — {t.duplicateReason}
                      </p>
                    ) : null}
                    {t.errors.map((e) => (
                      <p key={e} className="text-xs text-destructive">
                        {e}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={String(t.amount)}
                    onChange={(e) => {
                      const n = Number(
                        e.target.value.replace(",", ".").replace(/[^\d.]/g, ""),
                      );
                      if (!Number.isNaN(n)) {
                        patchTxn(t.id, {
                          amount: n,
                          signedAmount: t.type === "income" ? n : -n,
                          errors: n > 0 ? t.errors.filter((x) => x !== "Valor inválido") : t.errors,
                        });
                      }
                    }}
                    className="h-8 w-28 text-right tabular-nums"
                    aria-label="Valor"
                  />
                  <p
                    className={cn(
                      "mt-1 text-sm font-semibold tabular-nums",
                      t.type === "income" ? "text-income" : "text-expense",
                    )}
                  >
                    {t.type === "income" ? "+" : "-"}
                    {formatBrl(t.amount)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            <Button variant="outline" onClick={downloadCsv}>
              Exportar CSV
            </Button>
            <Button
              disabled={!draftCanProceedToConfirm(draft)}
              onClick={() => {
                setConfirmed(false);
                setStep("confirm");
              }}
            >
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === "confirm" && draft && summary ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-xl font-medium">
              Confirmar importação
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tudo pronto. Você está prestes a adicionar lançamentos ao cofre.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="type-label">Lançamentos</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {summary.included}
              </dd>
            </div>
            <div>
              <dt className="type-label">Entradas</dt>
              <dd className="text-xl font-semibold text-income tabular-nums">
                {formatBrl(summary.income)}
              </dd>
            </div>
            <div>
              <dt className="type-label">Saídas</dt>
              <dd className="text-xl font-semibold text-expense tabular-nums">
                {formatBrl(summary.expense)}
              </dd>
            </div>
            <div>
              <dt className="type-label">Ignorados</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {summary.ignored}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Os lançamentos serão adicionados ao seu cofre criptografado neste
            dispositivo.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            Confirmo que revisei os lançamentos.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep("review")}>
              Voltar à revisão
            </Button>
            <Button
              disabled={!confirmed || busy || !draftCanProceedToConfirm(draft)}
              onClick={() => void onConfirmImport()}
            >
              {busy
                ? "Importando…"
                : `Confirmar e adicionar ${summary.included} lançamentos`}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && commitResult ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading text-xl font-medium">
              Importação concluída
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {commitResult.count} lançamentos adicionados.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Entradas</dt>
              <dd className="font-medium text-income">
                {formatBrl(commitResult.income)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Saídas</dt>
              <dd className="font-medium text-expense">
                {formatBrl(commitResult.expense)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {rollbackRef ? (
              <Button variant="outline" disabled={busy} onClick={() => void onUndo()}>
                Desfazer
              </Button>
            ) : null}
            <Link href="/gastos">
              <Button variant="outline">Ver lançamentos</Button>
            </Link>
            <Link href="/">
              <Button>Voltar ao painel</Button>
            </Link>
            <Button variant="ghost" onClick={resetWizard}>
              Nova importação
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
