/**
 * Guarda de privacidade do runtime — reforça que a IA é somente leitura
 * e não acessa camadas acima de FinancialAIContext.
 */

import { assertAIContextIsSafe } from "../finance/FinancialPrivacySanitizer";
import type { FinancialAIContext } from "../finance/types";

const BLOCKED_OPS = [
  "indexedDB",
  "localStorage.setItem.vault",
  "fetch.external-llm",
  "eval",
  "Function",
] as const;

export function AIPrivacyGuard() {
  return {
    /** Valida contexto antes de enviar ao modelo. */
    validateContext(ctx: FinancialAIContext): void {
      const check = assertAIContextIsSafe(ctx);
      if (!check.ok) {
        throw new Error(`AIPrivacyGuard: ${check.violations.join(", ")}`);
      }
    },
    /** Documenta operações proibidas (sem side-effects). */
    blockedOperations(): readonly string[] {
      return BLOCKED_OPS;
    },
    /** A IA nunca modifica dados financeiros. */
    isReadOnly(): true {
      return true;
    },
  };
}
