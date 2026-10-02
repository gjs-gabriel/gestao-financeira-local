/**
 * Aplica adapter por instituição sobre o ParsedDocument genérico.
 */

import { detectInstitutionAdapter } from "./registry";
import { refineNubankDocument, isNubankSample } from "./nubank";
import { refineInterDocument, isInterSample } from "./inter";
import { refineItauDocument, isItauSample } from "./itau-refine";
import type { ParsedDocument } from "../types";

export function applyInstitutionAdapter(
  doc: ParsedDocument,
  lines: string[],
  fileName: string,
): ParsedDocument {
  const text = lines.join("\n").slice(0, 8000);
  const detected = detectInstitutionAdapter({ fileName, textSample: text });

  if (isNubankSample(fileName, text) || detected.id === "nubank") {
    return refineNubankDocument(doc, lines);
  }
  if (isInterSample(fileName, text) || detected.id === "inter") {
    return refineInterDocument(doc);
  }
  if (isItauSample(fileName, text) || detected.id === "itau") {
    return refineItauDocument(doc);
  }

  return {
    ...doc,
    warnings: [
      ...doc.warnings,
      detected.id !== "generic"
        ? `Instituição sugerida: ${detected.institutionName} (parser genérico).`
        : "Parser genérico — nenhum adapter específico aplicado.",
    ],
  };
}
