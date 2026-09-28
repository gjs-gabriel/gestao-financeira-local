/**
 * Contratos do Assistente Financeiro Local (runtime separado do navegador).
 * Sem PIN, sem chave do cofre, sem IDs internos.
 */

export const LOCAL_AI_DEFAULT_PORT = 43128;
export const LOCAL_AI_DEFAULT_BASE_URL = `http://127.0.0.1:${LOCAL_AI_DEFAULT_PORT}`;

/** Origens permitidas (CORS) — app Next em 43127. */
export const LOCAL_AI_ALLOWED_ORIGINS = [
  "http://127.0.0.1:43127",
  "http://localhost:43127",
] as const;

export type LocalAIRuntimeState =
  | "unknown"
  | "not_installed"
  | "stopped"
  | "starting"
  | "running"
  | "error";

export type LocalAIModelState =
  | "unknown"
  | "missing"
  | "downloading"
  | "ready"
  | "loading"
  | "error";

export interface LocalAIHealth {
  status: "ok" | "degraded" | "error";
  runtime: "ready" | "starting" | "unavailable";
  model: string | null;
  modelReady: boolean;
  version: string;
  backend?: string;
}

export interface LocalAIStatus {
  runtime: LocalAIRuntimeState;
  model: {
    name: string | null;
    loaded: boolean;
    quantization?: string;
    contextSize?: number;
  };
  backend: string | null;
  memory?: {
    availableMb?: number;
    usedMb?: number;
  };
  ollama?: {
    reachable: boolean;
    models: string[];
  };
  message?: string;
}

export interface LocalAIModelInfo {
  name: string;
  quantization?: string;
  contextSize?: number;
  sizeHint?: string;
  minRamGb?: number;
}

export interface FinancialContextPeriod {
  start: string;
  end: string;
}

export interface FinancialContextSummary {
  income: number;
  expenses: number;
  cashFlow: number;
  netWorth: number;
  savingsRate?: number | null;
  commitmentRatio?: number | null;
}

export interface FinancialContextCategory {
  category: string;
  amount: number;
  percentage: number;
  variation?: number | null;
}

export interface FinancialContextInvestment {
  class: string;
  amount: number;
  percentage: number;
}

export interface FinancialContextDebt {
  name: string;
  balance: number;
  installmentAmount?: number | null;
}

export interface FinancialContextGoal {
  name: string;
  current: number;
  target: number;
  progress: number;
  remaining: number;
}

/** Contexto minimizado enviado ao runtime — nunca PIN/chave/cofre. */
export interface FinancialContext {
  version: 1;
  intent: string;
  period: FinancialContextPeriod;
  summary: FinancialContextSummary;
  expensesByCategory?: FinancialContextCategory[];
  investments?: FinancialContextInvestment[];
  debts?: FinancialContextDebt[];
  goals?: FinancialContextGoal[];
  trends?: Record<string, unknown>;
  /** Extras já agregados (cenários, alertas) — sem txs brutas. */
  extras?: Record<string, unknown>;
  question?: string;
}

export type InsightImportance = "low" | "medium" | "high";
export type InsightSeverity = "info" | "attention" | "warning";

export interface FinancialAnalysisInsight {
  type?: string;
  severity?: InsightSeverity;
  importance?: InsightImportance;
  title: string;
  description: string;
  evidence?: string[];
}

export interface FinancialAnalysis {
  summary: string;
  insights: FinancialAnalysisInsight[];
  questions?: string[];
  recommendations?: string[];
  source: "local-runtime" | "mock" | "deterministic";
}

export interface LocalAIChatResult {
  text: string;
  source: "local-runtime" | "mock" | "deterministic";
}

export interface LocalAIClientOptions {
  baseUrl?: string;
  token?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AnalyzeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Interface única da UI com o runtime.
 * Trocar Ollama/llama.cpp não deve exigir mudar a UI.
 */
export interface LocalAIClient {
  readonly id: string;
  healthCheck(): Promise<LocalAIHealth>;
  getStatus(): Promise<LocalAIStatus>;
  getModelInfo(): Promise<LocalAIModelInfo | null>;
  isAvailable(): Promise<boolean>;
  analyze(
    context: FinancialContext,
    options?: AnalyzeOptions,
  ): Promise<FinancialAnalysis>;
  chat(
    context: FinancialContext,
    question: string,
    options?: AnalyzeOptions,
  ): Promise<LocalAIChatResult>;
  cancel(): void;
  setToken(token: string | null): void;
  getToken(): string | null;
}

export const LOCAL_AI_STORAGE_TOKEN_KEY = "gf-ai-runtime-token";
export const LOCAL_AI_STORAGE_DISABLED_KEY = "gf-ai-local-disabled";
export const LOCAL_AI_RUNTIME_VERSION = "1.0.0";

/** Modelo Ollama padrão — leve, PT razoável, CPU-friendly. */
export const LOCAL_AI_DEFAULT_MODEL = "qwen2.5:1.5b";
export const LOCAL_AI_FALLBACK_MODEL = "llama3.2:1b";

export function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

export function friendlyLocalAIError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i.test(msg)) {
    return "Assistente local indisponível. Inicie o runtime ou instale a IA local.";
  }
  if (/401|unauthorized|token/i.test(msg)) {
    return "Pareamento com o assistente local necessário. Abra Diagnóstico e reconecte.";
  }
  if (/timeout|AbortError/i.test(msg)) {
    return "A análise demorou mais que o esperado.";
  }
  if (/model.*not|missing model|pull/i.test(msg)) {
    return "O modelo ainda não foi instalado no assistente local.";
  }
  if (/memory|ENOMEM|out of memory/i.test(msg)) {
    return "A máquina não possui memória suficiente para executar este modelo.";
  }
  return "Não foi possível concluir a análise local. Seus dados financeiros continuam seguros.";
}
