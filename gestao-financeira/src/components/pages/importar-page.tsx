"use client";

import { useRef, useState } from "react";
import {
  applyImportDraft,
  buildImportDraft,
  type ImportDraftRow,
  type ImportRowKind,
} from "@/domain";
import {
  mapRowsToTransactions,
  parseBankFile,
  type ColumnMapping,
  type ParsedSheet,
} from "@/adapters/bank-import";
import { useVault } from "@/lib/vault-context";
import { EmptyState, Money, PageHeader } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InstitutionSelect } from "@/components/institution-select";
import { resolveInstitutionName } from "@/domain/institutions";

type Step = "upload" | "map" | "preview" | "done";

export function ImportarPage() {
  const { snapshot, updateSnapshot } = useVault();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [draft, setDraft] = useState<ImportDraftRow[]>([]);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [defaultInstitutionId, setDefaultInstitutionId] = useState<
    string | undefined
  >(undefined);
  const [defaultInstitutionOther, setDefaultInstitutionOther] = useState<
    string | undefined
  >(undefined);

  if (!snapshot) return null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseBankFile(file);
      setSheet(parsed);
      setMapping(parsed.suggestedMapping);
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler arquivo");
    } finally {
      setBusy(false);
    }
  }

  function goPreview() {
    if (!sheet || !mapping) return;
    setError(null);
    try {
      const txs = mapRowsToTransactions(sheet.rows, mapping);
      if (txs.length === 0) {
        setError("Nenhuma linha válida com data e valor. Ajuste o mapeamento.");
        return;
      }
      setDraft(
        buildImportDraft(snapshot!, txs, {
          institutionId: defaultInstitutionId,
          institutionOther: defaultInstitutionOther,
        }),
      );
      setStep("preview");    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapeamento inválido");
    }
  }

  async function confirmImport() {
    setBusy(true);
    setError(null);
    try {
      const result = applyImportDraft(snapshot!, draft);
      await updateSnapshot(() => result.snapshot);
      setResultMsg(
        `Importado: ${result.addedExpenses} gasto(s), ${result.addedIncomes} crédito(s). ` +
          `Ignorados: ${result.skippedDuplicates} duplicata(s), ${result.skippedExcluded} excluído(s).`,
      );
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gravar no cofre");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("upload");
    setSheet(null);
    setMapping(null);
    setDraft([]);
    setResultMsg(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateDraft(idx: number, patch: Partial<ImportDraftRow>) {
    setDraft((prev) => {
      const next = [...prev];
      const row = { ...next[idx]!, ...patch };
      next[idx] = row;
      return next;
    });
  }

  const expenseCats = snapshot.categories.filter(
    (c) => c.kind === "expense" || c.kind === "general",
  );
  const incomeCats = snapshot.categories.filter(
    (c) => c.kind === "income" || c.kind === "general",
  );

  return (
    <div>
      <PageHeader
        title="Importar extrato"
        description="CSV ou Excel do banco — parse no navegador, sem envio a servidor. Confirme antes de gravar no cofre."
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "upload" && (
        <div className="space-y-4">
          <EmptyState
            title="Envie o arquivo do banco"
            description="Aceita .csv e .xlsx. Detectamos ; ou ,, datas DD/MM/YYYY e valores com vírgula."
            action={
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? "Lendo…" : "Escolher arquivo"}
              </Button>
            }
          />
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      )}

      {step === "map" && sheet && mapping && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {sheet.rows.length} linha(s) · {sheet.headers.length} coluna(s).
            Ajuste o mapeamento se a detecção automática falhou.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <MapSelect
              label="Data"
              headers={sheet.headers}
              value={mapping.date}
              onChange={(v) => setMapping({ ...mapping, date: v })}
            />
            <MapSelect
              label="Descrição"
              headers={sheet.headers}
              value={mapping.description}
              onChange={(v) => setMapping({ ...mapping, description: v })}
              allowNone
            />
            <MapSelect
              label="Valor (único)"
              headers={sheet.headers}
              value={mapping.amount}
              onChange={(v) => setMapping({ ...mapping, amount: v })}
              allowNone
            />
            <MapSelect
              label="Débito (opcional)"
              headers={sheet.headers}
              value={mapping.debit}
              onChange={(v) => setMapping({ ...mapping, debit: v })}
              allowNone
            />
            <MapSelect
              label="Crédito (opcional)"
              headers={sheet.headers}
              value={mapping.credit}
              onChange={(v) => setMapping({ ...mapping, credit: v })}
              allowNone
            />
            <MapSelect
              label="Banco / Instituição"
              headers={sheet.headers}
              value={mapping.institution}
              onChange={(v) => setMapping({ ...mapping, institution: v })}
              allowNone
            />
          </div>
          <InstitutionSelect
            label="Instituição padrão (se a coluna estiver vazia)"
            institutions={snapshot.institutions}
            institutionId={defaultInstitutionId}
            institutionOther={defaultInstitutionOther}
            onChange={(inst) => {
              setDefaultInstitutionId(inst.institutionId);
              setDefaultInstitutionOther(inst.institutionOther);
            }}
          />
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[20rem] text-left text-xs">
              <thead className="bg-muted/40">
                <tr>
                  {sheet.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 font-medium">
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-t border-border/40">
                    {sheet.headers.map((_, ci) => (
                      <td key={ci} className="max-w-[8rem] truncate px-2 py-1">
                        {row[ci]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}>
              Voltar
            </Button>
            <Button onClick={goPreview}>Pré-visualizar</Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Revise cada linha: tipo, categoria e se deve importar. Duplicatas
            (mesma data + valor + descrição) são puladas.
          </p>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {draft.map((row, idx) => (
              <div
                key={`${row.rowIndex}-${idx}`}
                className="rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.date} · <Money value={row.amount} />
                      {row.institutionId && (
                        <span className="ml-1">
                          ·{" "}
                          {resolveInstitutionName(
                            row.institutionId,
                            row.institutionOther,
                            snapshot.institutions,
                          )}
                        </span>
                      )}
                      {row.duplicate && (
                        <Badge variant="secondary" className="ml-2">
                          duplicata
                        </Badge>
                      )}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={row.include && !row.duplicate}
                      disabled={row.duplicate}
                      onChange={(e) =>
                        updateDraft(idx, { include: e.target.checked })
                      }
                    />
                    Incluir
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Select
                    value={row.kind}
                    onValueChange={(v) => {
                      if (!v) return;
                      updateDraft(idx, { kind: v as ImportRowKind });
                    }}
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Gasto</SelectItem>
                      <SelectItem value="income">Renda</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.categoryId || "_none"}
                    onValueChange={(v) => {
                      if (v == null) return;
                      updateDraft(idx, {
                        categoryId: v === "_none" ? undefined : v,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Sem categoria</SelectItem>
                      {(row.kind === "expense" ? expenseCats : incomeCats).map(
                        (c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <div className="w-full sm:w-48">
                    <InstitutionSelect
                      label=""
                      institutions={snapshot.institutions}
                      institutionId={row.institutionId}
                      institutionOther={row.institutionOther}
                      onChange={(inst) => updateDraft(idx, inst)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep("map")}>
              Voltar
            </Button>
            <Button onClick={confirmImport} disabled={busy}>
              {busy ? "Gravando…" : "Confirmar importação"}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Importação concluída</AlertTitle>
            <AlertDescription>{resultMsg}</AlertDescription>
          </Alert>
          <Button onClick={reset}>Importar outro arquivo</Button>
        </div>
      )}
    </div>
  );
}

function MapSelect({
  label,
  headers,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  headers: string[];
  value: number | null;
  onChange: (v: number | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value == null ? "_none" : String(value)}
        onValueChange={(v) => {
          if (v == null || v === "_none") onChange(null);
          else onChange(Number(v));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="_none">—</SelectItem>}
          {headers.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              {h || `Coluna ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
