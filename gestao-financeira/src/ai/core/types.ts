/**
 * Tipos e contratos do runtime de IA local.
 * Sem dados financeiros aqui — só status e mensagens.
 */

export type AIModelStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "loading"
  | "ready"
  | "generating"
  | "error"
  | "unsupported"
  | "disabled";

export interface AIModelProgress {
  status: AIModelStatus;
  progress: number; // 0–1
  message?: string;
  /** Mensagem amigável (sempre preenchida em error/unsupported). */
  error?: string;
  /** Texto técnico original (DXGI, stack curta, etc.) — nunca ocultar na UI. */
  technicalError?: string;
  modelId?: string;
  runtime?: "webgpu" | "wasm" | "unknown";
}

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LocalAIProvider {
  readonly id: string;
  getStatus(): AIModelProgress;
  checkSupport(): Promise<{ supported: boolean; runtime: "webgpu" | "wasm" | "unknown" }>;
  loadModel(modelId?: string, onProgress?: (p: AIModelProgress) => void): Promise<void>;
  unloadModel(): Promise<void>;
  clearCache(): Promise<void>;
  generate(
    messages: AIChatMessage[],
    options?: AIGenerateOptions,
  ): Promise<string>;
  cancel(): void;
}

/**
 * Modelo padrão leve (≈0,5B).
 * WebLLM exige WebGPU — não há fallback CPU real para inferência.
 */
export const DEFAULT_AI_MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

/** Cadeia de fallback — só útil se o device ainda estiver vivo. */
export const AI_MODEL_FALLBACK_CHAIN = [
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "SmolLM2-360M-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
] as const;

/**
 * Janela de contexto do WebLLM.
 * Precisa caber system + fatos + pergunta + resposta (~192 tokens).
 * 1024 era curto demais para o panorama financeiro.
 */
export const AI_CONTEXT_WINDOW_SIZE = 4096;

/** Limite aproximado de caracteres do prompt (≈ tokens×3,5) para não estourar a janela. */
export const AI_MAX_FACTS_CHARS = 2800;

const GPU_LOST_RE =
  /device was lost|GPUDeviceLost|GPUBuffer|unmapped|out of memory|OOM|insufficient memory|DXGI_ERROR_DEVICE_REMOVED|DEVICE_REMOVED|0x887A0005|requestDevice|D3D12|create command queue|adapter.*lost/i;

export function isGpuDeviceLostError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return GPU_LOST_RE.test(msg);
}

/** Device removido: tentar outro modelo na mesma página costuma falhar. */
export function isGpuDeviceRemovedHard(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /DXGI_ERROR_DEVICE_REMOVED|DEVICE_REMOVED|0x887A0005|requestDevice|create command queue/i.test(
    msg,
  );
}

export function rawAiError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "erro desconhecido");
}

export function isContextWindowError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /prompt tokens exceed context window|context window size/i.test(msg);
}

export function friendlyAiError(error: unknown): string {
  if (isGpuDeviceRemovedHard(error) || isGpuDeviceLostError(error)) {
    return (
      "Falha ao baixar/carregar a IA: a GPU do navegador foi reiniciada (WebGPU/D3D12). " +
      "Recarregue a página (F5), feche abas com vídeo/jogos e tente de novo. " +
      "O Analista continua com o resumo calculado sem o modelo."
    );
  }
  if (isContextWindowError(error)) {
    return (
      "O texto enviado à IA passou do limite da janela de contexto. " +
      "Clique em Recarregar modelo (janela maior) e tente de novo com uma pergunta mais curta."
    );
  }
  if (error instanceof Error && error.message) {
    return `Falha na IA local: ${error.message}`;
  }
  return "Falha na IA local";
}

export function aiLog(
  event:
    | "AI_MODEL_LOADING"
    | "AI_MODEL_READY"
    | "AI_MODEL_ERROR"
    | "AI_GENERATION_STARTED"
    | "AI_GENERATION_COMPLETED"
    | "AI_GENERATION_ERROR"
    | "AI_CACHE_CLEARED"
    | "AI_CONTEXT_CLEARED",
  detail?: string,
): void {
  if (typeof console === "undefined") return;
  const line = `[AI] ${event}${detail ? `: ${detail}` : ""}`;
  if (event.includes("ERROR")) console.error(line);
  else console.info(line);
}
