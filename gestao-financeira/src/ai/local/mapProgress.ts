/**
 * Adapta RuntimeProgress → AIModelProgress para a UI existente.
 */

import type { AIModelProgress } from "../core/types";
import type { RuntimeProgress } from "./RuntimeManager";
import { LOCAL_AI_DEFAULT_MODEL } from "./types";

export function runtimeProgressToModelProgress(
  p: RuntimeProgress,
): AIModelProgress {
  const status =
    p.phase === "ready"
      ? "ready"
      : p.phase === "checking" || p.phase === "pairing" || p.phase === "starting"
        ? "checking"
        : p.phase === "disabled"
          ? "disabled"
          : p.phase === "error"
            ? "error"
            : p.phase === "unavailable"
              ? "unsupported"
              : "idle";

  return {
    status,
    progress: status === "ready" ? 1 : status === "checking" ? 0.3 : 0,
    message: p.message,
    error: p.error || (status === "error" || status === "unsupported" ? p.message : undefined),
    technicalError: p.error,
    modelId: p.status?.model.name ?? p.health?.model ?? LOCAL_AI_DEFAULT_MODEL,
    runtime: "unknown",
  };
}
