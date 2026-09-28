export type { LocalAIProvider, AIModelProgress, AIModelStatus } from "./core/types";
export { DEFAULT_AI_MODEL_ID, aiLog } from "./core/types";
export { getAIModelManager, AIModelManager } from "./core/AIModelManager";
export * from "./finance";
export {
  LOCAL_AI_DEFAULT_PORT,
  LOCAL_AI_DEFAULT_BASE_URL,
  LOCAL_AI_DEFAULT_MODEL,
  LOCAL_AI_FALLBACK_MODEL,
  LOCAL_AI_RUNTIME_VERSION,
  LOCAL_AI_STORAGE_TOKEN_KEY,
  LOCAL_AI_STORAGE_DISABLED_KEY,
  friendlyLocalAIError,
  isLocalhostUrl,
  type FinancialContext,
  type FinancialAnalysis,
  type LocalAIClient,
  type LocalAIHealth,
  type LocalAIStatus,
} from "./local/types";
export {
  buildFinancialContextFromSnapshot,
  buildFinancialTestContext,
  assertNoSecretsInContext,
} from "./local/AnalysisContextBuilder";
export { MockLocalAIClient } from "./local/MockLocalAIClient";
export { HttpLocalAIClient } from "./local/HttpLocalAIClient";
export {
  RuntimeManager,
  getRuntimeManager,
  resetRuntimeManagerForTests,
} from "./local/RuntimeManager";
export { runtimeProgressToModelProgress } from "./local/mapProgress";
