import {
  buildFinancialAIContext,
  type FinancialSnapshot,
  type AIContextIntent,
} from "../finance";
import { AIPrivacyGuard } from "./AIPrivacyGuard";

const guard = AIPrivacyGuard();

/**
 * Constrói FinancialAIContext validado — única ponte para o runtime.
 */
export function buildValidatedAIContext(
  snapshot: FinancialSnapshot,
  intent: AIContextIntent,
  extra?: Record<string, unknown>,
) {
  const ctx = buildFinancialAIContext(snapshot, intent, extra);
  guard.validateContext(ctx);
  return ctx;
}
