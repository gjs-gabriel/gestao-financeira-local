import { MAX_FILE_BYTES, type ImportSourceKind } from "./types";

export interface FileValidationResult {
  ok: boolean;
  kind?: ImportSourceKind;
  error?: string;
}

function startsWithBytes(buf: Uint8Array, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

/** Valida extensão + magic bytes + tamanho. Não confia só na extensão. */
export async function validateImportFile(
  file: File,
): Promise<FileValidationResult> {
  if (file.size <= 0) {
    return { ok: false, error: "O arquivo está vazio." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "Esse arquivo é maior que o limite permitido (15 MB).",
    };
  }

  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    // %PDF
    if (!startsWithBytes(buf, [0x25, 0x50, 0x44, 0x46])) {
      return {
        ok: false,
        error: "Este arquivo não parece ser um PDF válido.",
      };
    }
    return { ok: true, kind: "pdf" };
  }

  if (name.endsWith(".csv") || file.type === "text/csv") {
    // CSV: aceitar texto; rejeitar binários óbvios (ZIP/PDF)
    if (startsWithBytes(buf, [0x25, 0x50, 0x44, 0x46])) {
      return { ok: false, error: "O arquivo parece ser PDF, não CSV." };
    }
    if (startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04])) {
      return {
        ok: false,
        error: "O arquivo parece ser Excel/ZIP, não CSV.",
      };
    }
    return { ok: true, kind: "csv" };
  }

  if (name.endsWith(".xlsx")) {
    // ZIP (OOXML)
    if (!startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04])) {
      return {
        ok: false,
        error: "Este arquivo não parece ser um Excel (.xlsx) válido.",
      };
    }
    return { ok: true, kind: "xlsx" };
  }

  if (name.endsWith(".xls")) {
    // OLE compound: D0 CF 11 E0
    if (
      !startsWithBytes(buf, [0xd0, 0xcf, 0x11, 0xe0]) &&
      !startsWithBytes(buf, [0x50, 0x4b, 0x03, 0x04])
    ) {
      return {
        ok: false,
        error: "Este arquivo não parece ser um Excel (.xls) válido.",
      };
    }
    return { ok: true, kind: "xls" };
  }

  return {
    ok: false,
    error:
      "Não conseguimos identificar este documento. Use PDF, CSV ou Excel.",
  };
}
