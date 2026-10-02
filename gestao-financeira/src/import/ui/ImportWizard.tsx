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
  ImportPasswordRequiredError,
  type FinancialImportDraft,
  type FinancialImportDraftTxn,
  type ImportAccountSnapshot,
  type ImportHoldingSnapshot,
  type ImportRollbackRef,
  type ImportSourceKind,
  type ImportVisualStep,
  type ParsedDocument,
} from "@/import";
import { parseCsvRawWithMapping } from "@/import/parsers/document-parser";
import { parsePdfDocumentWithOcr } from "@/import/parsers/pdf-parser";
import type { CsvColumnMapping } from "@/import/parsers/csv-parser";
import { unresolvedConfirmationCount } from "@/import/reconcile/apply-decision";
import { ImportStepIndicator } from "./ImportStepIndicator";
import { ImportDropzone, ImportFormatCards } from "./ImportDropzone";
import { ConciliationPanel } from "./ConciliationPanel";
import { CsvMappingPanel } from "./CsvMappingPanel";
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

function DocumentIdentity({
  draft,
  onAccount,
  onHolding,
}: {
  draft: FinancialImportDraft;
  onAccount?: (id: string, include: boolean) => void;
  onHolding?: (id: string, include: boolean) => void;
}) {
  const accounts = draft.accountSnapshots ?? [];
  const holdings = draft.holdings ?? [];
  if (!draft.institution && accounts.length === 0 && holdings.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-4 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">
          {draft.documentType === "income_report"
            ? "Informe de rendimentos"
            : "Extrato"}
        </p>
        <p className="font-heading text-lg font-medium">
          {draft.institution?.institutionName ?? "Instituição não identificada"}
        </p>
      </div>
      {accounts.map((account) => (
        <div key={account.id} className="flex items-start justify-between gap-3">
          <label className="flex items-start gap-2">
            {onAccount ? (
              <Checkbox
                checked={account.include}
                onCheckedChange={(v) => onAccount(account.id, v === true)}
                aria-label={`Atualizar ${account.label}`}
              />
            ) : null}
            <span>
              <span className="block font-medium">{account.label}</span>
              <span className="text-xs text-muted-foreground">
                {account.agency ? `Agência ${account.agency} · ` : ""}
                Saldo em {account.asOf}
                {account.openingBalance != null
                  ? ` · inicial ${formatBrl(account.openingBalance)}`
                  : ""}
              </span>
            </span>
          </label>
          <span className="font-semibold tabular-nums">
            {formatBrl(account.closingBalance)}
          </span>
        </div>
      ))}
      {holdings.map((holding) => (
        <div key={holding.id} className="flex items-start justify-between gap-3">
          <label className="flex items-start gap-2">
            {onHolding ? (
              <Checkbox
                checked={holding.include}
                onCheckedChange={(v) => onHolding(holding.id, v === true)}
                aria-label={`Atualizar ${holding.name}`}
              />
            ) : null}
            <span>
              <span className="block font-medium">{holding.name}</span>
              <span className="text-xs text-muted-foreground">
                Aplicação · saldo em {holding.asOf}
                {holding.notes ? ` · ${holding.notes}` : ""}
              </span>
            </span>
          </label>
          <span className="font-semibold tabular-nums">
            {formatBrl(holding.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

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
    accounts: number;
    investments: number;
  } | null>(null);
  const [rollbackRef, setRollbackRef] = useState<ImportRollbackRef | null>(
    null,
  );
  const [useAI, setUseAI] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [passwordFile, setPasswordFile] = useState<File | null>(null);
  const [csvPending, setCsvPending] = useState<{
    fileName: string;
    headers: string[];
    suggested: CsvColumnMapping;
    rawText: string;
  } | null>(null);
  const [ocrFile, setOcrFile] = useState<File | null>(null);

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
      setPasswordFile(null);
      setPdfPassword("");
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
    const investments = included
      .filter((t) => t.type === "investment")
      .reduce((s, t) => s + t.amount, 0);
    return {
      total: draft.transactions.length,
      included: included.length,
      income,
      expense,
      investments,
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

  function patchAccounts(nextAccounts: ImportAccountSnapshot[]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, accountSnapshots: nextAccounts };
      next.validation = validateImportDraft(next);
      session.updateDraft(next);
      return next;
    });
  }

  function patchHoldings(nextHoldings: ImportHoldingSnapshot[]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, holdings: nextHoldings };
      next.validation = validateImportDraft(next);
      session.updateDraft(next);
      return next;
    });
  }

  async function finishFromParsed(doc: ParsedDocument, fileName: string) {
    if (!userSessionId || !snapshot) return;
    setParsed(doc);
    session.setParsed(doc, fileName);
    setPasswordFile(null);
    setPdfPassword("");
    setCsvPending(null);
    setOcrFile(null);
    const bank = doc.institution?.institutionName;
    const account = doc.accounts?.find((item) => item.include);
    setProgress((p) => [
      ...p,
      doc.documentType === "income_report"
        ? "Informe de rendimentos identificado"
        : `Documento lido${doc.pages ? ` · ${doc.pages} página(s)` : ""}`,
      bank
        ? `Banco: ${bank}${account?.accountNumber ? ` · conta ${account.accountNumber}` : ""}`
        : "Banco não identificado no arquivo",
      doc.documentType === "income_report"
        ? `${doc.accounts?.length ?? 0} conta(s) e ${doc.holdings?.length ?? 0} aplicação(ões)`
        : `${doc.rows.length} lançamentos encontrados`,
    ]);

    setProgress((p) => [...p, "Classificando e sugerindo categorias…"]);
    let generate:
      | ((messages: { role: string; content: string }[]) => Promise<string>)
      | undefined;
    if (useAI) {
      try {
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
      fileName,
      userSessionId,
      snapshot,
    });
    setDraft(built);
    session.setDraft(built);
    setStep("review");
    setFilter(built.validation.attentionCount > 0 ? "attention" : "all");
  }

  async function processFile(file: File, password?: string) {
    if (!userSessionId || !snapshot) return;
    setBusy(true);
    setError(null);
    setProgress([]);
    setStep("analysis");
    session.start(userSessionId);

    try {
      setProgress(["Lendo documento…"]);
      const doc = await parseDocument(file, {
        password: password?.slice(0, 128),
      });

      if (doc.csvMappingRequired) {
        setCsvPending({
          fileName: file.name,
          headers: doc.csvMappingRequired.headers,
          suggested: doc.csvMappingRequired.suggested as CsvColumnMapping,
          rawText: doc.csvMappingRequired.rawText,
        });
        setStep("document");
        setProgress([]);
        setBusy(false);
        return;
      }

      if (doc.needsOcr) {
        setOcrFile(file);
        setError(
          "Este PDF parece ser escaneado (sem texto). Rode o OCR local offline ou escolha outro arquivo.",
        );
        setStep("document");
        session.clear();
        setBusy(false);
        return;
      }

      await finishFromParsed(doc, file.name);
    } catch (e) {
      if (e instanceof ImportPasswordRequiredError) {
        setPasswordFile(file);
        setPickKind((kind) => kind ?? "pdf");
        setError(e.message);
        setStep("document");
        session.clear();
        return;
      }
      setError(e instanceof Error ? e.message : "Falha ao processar");
      setStep("document");
      session.clear();
    } finally {
      setBusy(false);
    }
  }

  async function runOcrOnPending() {
    if (!ocrFile || !userSessionId || !snapshot) return;
    setBusy(true);
    setError(null);
    setProgress(["OCR local (offline)…"]);
    setStep("analysis");
    session.start(userSessionId);
    try {
      const doc = await parsePdfDocumentWithOcr(ocrFile, {
        password: pdfPassword.slice(0, 128) || undefined,
        onProgress: (p) => {
          setProgress([
            `OCR: ${p.status} (${Math.round(p.progress * 100)}%)`,
          ]);
        },
      });
      if (doc.needsOcr && doc.rows.length === 0) {
        setError(doc.warnings.join(" ") || "OCR sem resultado útil.");
        setStep("document");
        session.clear();
        return;
      }
      await finishFromParsed(doc, ocrFile.name);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Falha no OCR local. Confira public/ocr/por.traineddata.",
      );
      setStep("document");
      session.clear();
    } finally {
      setBusy(false);
    }
  }

  async function continueWithCsvMapping(mapping: CsvColumnMapping) {
    if (!csvPending || !userSessionId || !snapshot) return;
    setBusy(true);
    setError(null);
    setProgress(["Aplicando mapeamento CSV…"]);
    setStep("analysis");
    session.start(userSessionId);
    try {
      const doc = parseCsvRawWithMapping(
        csvPending.rawText,
        csvPending.fileName,
        mapping,
      );
      await finishFromParsed(doc, csvPending.fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no CSV");
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
        accounts: result.addedAccounts + result.updatedAccounts,
        investments: result.addedInvestments + result.updatedInvestments,
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
    setPasswordFile(null);
    setPdfPassword("");
    setCsvPending(null);
    setOcrFile(null);
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
              Extratos e informes de rendimentos em PDF identificam o banco, a
              conta, o saldo e as aplicações.
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPickKind(null);
                setCsvPending(null);
                setOcrFile(null);
              }}
            >
              Voltar
            </Button>
          </div>

          {csvPending ? (
            <CsvMappingPanel
              fileName={csvPending.fileName}
              headers={csvPending.headers}
              suggested={csvPending.suggested}
              onCancel={() => setCsvPending(null)}
              onConfirm={(mapping) => void continueWithCsvMapping(mapping)}
            />
          ) : null}

          {ocrFile && !csvPending ? (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm">
                PDF escaneado detectado. O OCR roda 100% no seu aparelho (Tesseract
                + idioma português em <code className="text-xs">/ocr</code>).
              </p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void runOcrOnPending()}
              >
                {busy ? "OCR em andamento…" : "Rodar OCR local"}
              </Button>
            </div>
          ) : null}

          {passwordFile ? (
            <form
              className="space-y-3 rounded-xl border border-border/50 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void processFile(passwordFile, pdfPassword);
              }}
            >
              <div className="space-y-1">
                <p className="font-medium">PDF protegido por senha</p>
                <p className="text-sm text-muted-foreground">
                  Informe a senha do arquivo. Em vários bancos ela é o CPF, só
                  com números. A senha não é gravada.
                </p>
              </div>
              <Input
                type="password"
                value={pdfPassword}
                autoComplete="off"
                maxLength={128}
                onChange={(event) => setPdfPassword(event.target.value)}
                aria-label="Senha do PDF"
              />
              <Button
                type="submit"
                disabled={busy || pdfPassword.trim().length === 0}
              >
                {busy ? "Abrindo…" : "Abrir documento"}
              </Button>
            </form>
          ) : null}

          {!csvPending ? (
            <ImportDropzone
              acceptKind={pickKind}
              busy={busy}
              onFile={(f) => void processFile(f)}
              error={error}
            />
          ) : null}
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
              {draft.documentType === "income_report"
                ? "Revise conta e aplicações"
                : "Revise seus lançamentos"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.documentType === "income_report"
                ? "O informe atualiza saldo de conta e de investimento. Rendimentos do informe não viram receita."
                : `Encontramos ${summary.total} lançamentos. O saldo da conta segue o extrato.`}
            </p>
          </div>

          <DocumentIdentity
            draft={draft}
            onAccount={(id, include) =>
              patchAccounts(
                draft.accountSnapshots.map((account) =>
                  account.id === id ? { ...account, include } : account,
                ),
              )
            }
            onHolding={(id, include) =>
              patchHoldings(
                draft.holdings.map((holding) =>
                  holding.id === id ? { ...holding, include } : holding,
                ),
              )
            }
          />

          <ConciliationPanel
            draft={draft}
            onDraftChange={(next) => {
              setDraft(next);
              session.updateDraft(next);
            }}
          />

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
                            v === "investment" ||
                            v === "unknown"
                          ) {
                            patchTxn(t.id, {
                              type: v,
                              signedAmount:
                                v === "income"
                                  ? t.amount
                                  : v === "investment"
                                    ? t.type === "investment"
                                      ? t.signedAmount
                                      : -t.amount
                                    : -t.amount,
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
                          <SelectItem value="investment">Investimento</SelectItem>
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
                      t.type === "income" ||
                      (t.type === "investment" && t.signedAmount > 0)
                        ? "text-income"
                        : "text-expense",
                    )}
                  >
                    {t.type === "income" ||
                  (t.type === "investment" && t.signedAmount > 0)
                    ? "+"
                    : "-"}
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
                const pending = unresolvedConfirmationCount(draft.reconciliation);
                if (pending > 0) {
                  setError(
                    `${pending} item(ns) da conciliação ainda precisam de decisão (vincular, novo, manter ou ignorar).`,
                  );
                  return;
                }
                setError(null);
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
              Tudo pronto. Conta, saldo, aplicações e lançamentos entram no
              cofre só depois desta confirmação.
            </p>
          </div>
          <DocumentIdentity draft={draft} />
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
            {summary.investments > 0 ? (
              <div>
                <dt className="type-label">Aplicações movimentadas</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {formatBrl(summary.investments)}
                </dd>
              </div>
            ) : null}
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
            Confirmo que revisei conta, saldo, aplicações e lançamentos.
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
                : draft.documentType === "income_report"
                  ? "Confirmar e atualizar saldos"
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
              {commitResult.accounts > 0
                ? `${commitResult.accounts} conta(s) com saldo atualizado. `
                : ""}
              {commitResult.investments > 0
                ? `${commitResult.investments} aplicação(ões) atualizada(s). `
                : ""}
              {commitResult.count} item(ns) gravados no cofre.
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
            <Link href="/contas">
              <Button variant="outline">Ver contas</Button>
            </Link>
            <Link href="/aplicacoes">
              <Button variant="outline">Ver aplicações</Button>
            </Link>
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
