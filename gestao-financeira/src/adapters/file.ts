import type { GfinEnvelope } from "@/domain";
import { parseEnvelope } from "./crypto";

/** Dispara download do arquivo .gfin no browser. */
export function downloadGfin(
  envelope: GfinEnvelope,
  filename = "cofre.gfin",
): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".gfin") ? filename : `${filename}.gfin`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lê e valida um arquivo .gfin enviado pelo usuário. */
export async function readGfinFile(file: File): Promise<GfinEnvelope> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Arquivo .gfin inválido (JSON corrompido)");
  }
  return parseEnvelope(parsed);
}
