"use client";

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Lock, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ImportSourceKind } from "@/import/types";

export function ImportDropzone({
  acceptKind,
  busy,
  onFile,
  error,
}: {
  acceptKind?: ImportSourceKind | "any";
  busy?: boolean;
  onFile: (file: File) => void;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const accept =
    acceptKind === "pdf"
      ? ".pdf,application/pdf"
      : acceptKind === "csv"
        ? ".csv,text/csv"
        : acceptKind === "ofx"
          ? ".ofx,.qfx,application/x-ofx"
          : acceptKind === "xlsx" || acceptKind === "xls"
            ? ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            : ".pdf,.csv,.xlsx,.xls,.ofx,.qfx";

  const handle = useCallback(
    (file: File | undefined) => {
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-white/40 px-6 py-12 text-center transition-colors backdrop-blur-sm",
          dragOver && "border-primary bg-primary/5",
          busy && "opacity-60",
        )}
      >
        <Upload className="size-8 text-primary" aria-hidden />
        <div>
          <p className="font-medium">Arraste o arquivo aqui</p>
          <p className="mt-1 text-sm text-muted-foreground">
            ou clique para selecionar
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          disabled={busy}
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ImportFormatCards({
  onPick,
}: {
  onPick: (kind: ImportSourceKind | "any") => void;
}) {
  const cards: {
    kind: ImportSourceKind | "any";
    title: string;
    subtitle: string;
    icon: typeof FileText;
  }[] = [
    {
      kind: "pdf",
      title: "PDF",
      subtitle: "Extrato ou informe",
      icon: FileText,
    },
    {
      kind: "xlsx",
      title: "Excel",
      subtitle: "Planilha",
      icon: FileSpreadsheet,
    },
    {
      kind: "csv",
      title: "CSV",
      subtitle: "Com mapeamento",
      icon: FileSpreadsheet,
    },
    {
      kind: "ofx",
      title: "OFX",
      subtitle: "Extrato bancário",
      icon: FileText,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ kind, title, subtitle, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          className="surface-panel px-4 py-8 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="mb-3 size-6 text-primary" aria-hidden />
          <p className="font-heading text-lg font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </button>
      ))}
      <div className="sm:col-span-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onPick("any")}
        >
          Ou escolher qualquer formato suportado
        </Button>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
        <Lock className="size-3.5" aria-hidden />
        Processamento local — seus documentos são processados neste dispositivo.
      </p>
    </div>
  );
}
