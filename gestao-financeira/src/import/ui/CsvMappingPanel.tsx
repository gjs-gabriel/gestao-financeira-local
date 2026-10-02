"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsvColumnMapping, CsvColumnRole } from "../parsers/csv-parser";

const ROLES: { value: CsvColumnRole; label: string }[] = [
  { value: "date", label: "Data" },
  { value: "description", label: "Descrição / Histórico" },
  { value: "amount", label: "Valor (assinado)" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
  { value: "balance", label: "Saldo" },
  { value: "ignore", label: "Ignorar" },
];

const STORAGE_PREFIX = "gfin.csvMap.";

function mappingKey(headers: string[]): string {
  return STORAGE_PREFIX + headers.map((h) => h.trim().toLowerCase()).join("|").slice(0, 180);
}

export function loadSavedCsvMapping(
  headers: string[],
): CsvColumnMapping | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(mappingKey(headers));
    if (!raw) return null;
    return JSON.parse(raw) as CsvColumnMapping;
  } catch {
    return null;
  }
}

export function saveCsvMapping(
  headers: string[],
  mapping: CsvColumnMapping,
): void {
  if (typeof window === "undefined") return;
  try {
    // Só nomes de coluna — sem dados financeiros
    localStorage.setItem(mappingKey(headers), JSON.stringify(mapping));
  } catch {
    /* ignore quota */
  }
}

export function CsvMappingPanel({
  fileName,
  headers,
  suggested,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  headers: string[];
  suggested: CsvColumnMapping;
  onConfirm: (mapping: CsvColumnMapping) => void;
  onCancel: () => void;
}) {
  const saved = useMemo(() => loadSavedCsvMapping(headers), [headers]);
  const [mapping, setMapping] = useState<CsvColumnMapping>(
    () => saved ?? suggested,
  );

  const ok =
    Object.values(mapping).includes("date") &&
    Object.values(mapping).includes("description") &&
    (Object.values(mapping).includes("amount") ||
      (Object.values(mapping).includes("debit") &&
        Object.values(mapping).includes("credit")));

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-card/40 p-4">
      <div>
        <h3 className="font-heading text-lg font-medium">
          Mapear colunas do CSV
        </h3>
        <p className="text-sm text-muted-foreground">
          Arquivo <span className="font-medium text-foreground">{fileName}</span>.
          Associe cada coluna ao campo financeiro. O mapeamento (só cabeçalhos)
          pode ser reutilizado depois.
        </p>
      </div>

      <div className="space-y-2">
        {headers.map((h) => (
          <div
            key={h}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="font-medium">{h || "(sem nome)"}</span>
            <Select
              value={mapping[h] ?? "ignore"}
              onValueChange={(v) =>
                setMapping((prev) => ({
                  ...prev,
                  [h]: (v as CsvColumnRole) || "ignore",
                }))
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {!ok ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Informe ao menos Data, Descrição e Valor (ou Débito+Crédito).
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!ok}
          onClick={() => {
            saveCsvMapping(headers, mapping);
            onConfirm(mapping);
          }}
        >
          Continuar importação
        </Button>
      </div>
    </div>
  );
}
