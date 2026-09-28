"use client";

import {
  aiLog,
  AI_CONTEXT_WINDOW_SIZE,
  AI_MODEL_FALLBACK_CHAIN,
  DEFAULT_AI_MODEL_ID,
  friendlyAiError,
  isContextWindowError,
  isGpuDeviceLostError,
  isGpuDeviceRemovedHard,
  rawAiError,
  type AIChatMessage,
  type AIGenerateOptions,
  type AIModelProgress,
  type AIModelStatus,
  type LocalAIProvider,
} from "../core/types";

type EngineLike = {
  chat: {
    completions: {
      create: (opts: {
        messages: { role: string; content: string }[];
        temperature?: number;
        max_tokens?: number;
        stream?: boolean;
      }) => Promise<{ choices: { message?: { content?: string } }[] }>;
    };
  };
  unload: () => Promise<void>;
};

/**
 * Provider WebLLM — exige WebGPU.
 * Em DXGI_ERROR_DEVICE_REMOVED: para imediatamente e expõe o erro na UI.
 */
export class WebLLMProvider implements LocalAIProvider {
  readonly id = "webllm";
  private engine: EngineLike | null = null;
  private status: AIModelProgress = {
    status: "idle",
    progress: 0,
    modelId: DEFAULT_AI_MODEL_ID,
    runtime: "unknown",
  };
  private disabled = false;
  private loading: Promise<void> | null = null;
  private generating: Promise<string> | null = null;
  /** Após DEVICE_REMOVED, exige reload da página. */
  private deviceDead = false;
  /** Janela com que o engine atual foi criado — força reload se a constante mudar. */
  private loadedContextSize = 0;

  getStatus(): AIModelProgress {
    return { ...this.status };
  }

  setDisabled(value: boolean): void {
    this.disabled = value;
    if (value) {
      void this.unloadModel({ quiet: true });
      this.status = {
        ...this.status,
        status: "disabled",
        message: "IA local desativada",
        error: undefined,
        technicalError: undefined,
      };
    } else if (this.status.status === "disabled") {
      this.status = {
        ...this.status,
        status: "idle",
        message: undefined,
        error: undefined,
        technicalError: undefined,
      };
    }
  }

  async checkSupport(): Promise<{
    supported: boolean;
    runtime: "webgpu" | "wasm" | "unknown";
  }> {
    if (this.disabled) {
      return { supported: false, runtime: "unknown" };
    }
    if (this.deviceDead) {
      this.setFailure(
        "unsupported",
        friendlyAiError(new Error("DXGI_ERROR_DEVICE_REMOVED")),
        "DXGI_ERROR_DEVICE_REMOVED (sessão anterior — recarregue a página)",
      );
      return { supported: false, runtime: "unknown" };
    }
    this.setStatus("checking", 0, "Verificando compatibilidade…");
    if (typeof navigator === "undefined") {
      this.setFailure("unsupported", "Ambiente sem navegador", "no-navigator");
      return { supported: false, runtime: "unknown" };
    }
    try {
      const nav = navigator as Navigator & {
        gpu?: {
          requestAdapter: () => Promise<{
            requestDevice?: () => Promise<unknown>;
          } | null>;
        };
      };
      const gpu = nav.gpu;
      if (!gpu) {
        this.setFailure(
          "unsupported",
          "Este navegador não oferece WebGPU (necessário para a IA local).",
          "navigator.gpu missing",
        );
        return { supported: false, runtime: "unknown" };
      }
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        this.setFailure(
          "unsupported",
          "Nenhum adaptador WebGPU disponível neste dispositivo.",
          "requestAdapter() returned null",
        );
        return { supported: false, runtime: "unknown" };
      }
      if (typeof adapter.requestDevice === "function") {
        try {
          const device = (await adapter.requestDevice()) as {
            destroy?: () => void;
          };
          device.destroy?.();
        } catch (e) {
          this.markDeviceDead(e);
          return { supported: false, runtime: "unknown" };
        }
      }
      this.status.runtime = "webgpu";
      this.setStatus("idle", 0, "WebGPU disponível");
      return { supported: true, runtime: "webgpu" };
    } catch (e) {
      if (isGpuDeviceLostError(e) || isGpuDeviceRemovedHard(e)) {
        this.markDeviceDead(e);
        return { supported: false, runtime: "unknown" };
      }
      this.setFailure(
        "unsupported",
        "Dispositivo sem aceleração adequada para a IA local.",
        rawAiError(e),
      );
      return { supported: false, runtime: "unknown" };
    }
  }

  async loadModel(
    modelId = DEFAULT_AI_MODEL_ID,
    onProgress?: (p: AIModelProgress) => void,
  ): Promise<void> {
    if (this.disabled) {
      const msg = "IA local desativada";
      this.setFailure("disabled", msg, msg, modelId);
      onProgress?.(this.getStatus());
      throw new Error(msg);
    }
    if (this.deviceDead) {
      const tech = "DXGI_ERROR_DEVICE_REMOVED (deviceDead — recarregue a página)";
      const msg = friendlyAiError(new Error("DXGI_ERROR_DEVICE_REMOVED"));
      this.setFailure("unsupported", msg, tech, modelId);
      onProgress?.(this.getStatus());
      console.error("[AI] loadModel bloqueado:", tech);
      throw new Error(`${msg}\n\nDetalhe: ${tech}`);
    }
    if (
      this.engine &&
      this.status.modelId === modelId &&
      this.status.status === "ready" &&
      this.loadedContextSize === AI_CONTEXT_WINDOW_SIZE
    ) {
      return;
    }
    if (this.loading) {
      await this.loading;
      return;
    }

    this.loading = this.loadWithFallback(modelId, onProgress).finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async loadWithFallback(
    preferred: string,
    onProgress?: (p: AIModelProgress) => void,
  ): Promise<void> {
    const support = await this.checkSupport();
    if (!support.supported) {
      const msg =
        this.status.error ||
        this.status.message ||
        "WebGPU indisponível para a IA local";
      const tech = this.status.technicalError || msg;
      this.setFailure("unsupported", msg, tech, preferred);
      onProgress?.(this.getStatus());
      console.error("[AI] WebGPU indisponível:", tech);
      throw new Error(`${msg}\n\nDetalhe: ${tech}`);
    }

    await this.unloadModel({ quiet: true });

    const chain = [
      preferred,
      ...AI_MODEL_FALLBACK_CHAIN.filter((id) => id !== preferred),
    ];

    let lastError: unknown;
    for (const modelId of chain) {
      try {
        await this.loadOne(modelId, onProgress);
        return;
      } catch (e) {
        lastError = e;
        await this.unloadModel({ quiet: true });
        const friendly = friendlyAiError(e);
        const tech = rawAiError(e);
        aiLog("AI_MODEL_ERROR", `${modelId}: ${tech}`);
        console.error(`[AI] Falha ao carregar ${modelId}:`, e);

        if (isGpuDeviceRemovedHard(e) || isGpuDeviceLostError(e)) {
          this.markDeviceDead(e);
          onProgress?.(this.getStatus());
          throw new Error(`${friendly}\n\nDetalhe: ${tech}`);
        }

        this.setFailure("error", friendly, tech, modelId);
        onProgress?.(this.getStatus());
      }
    }

    const friendly = friendlyAiError(lastError);
    const tech = rawAiError(lastError);
    this.setFailure("error", friendly, tech, preferred);
    onProgress?.(this.getStatus());
    console.error("[AI] Todos os modelos falharam:", tech);
    throw new Error(`${friendly}\n\nDetalhe: ${tech}`);
  }

  private async loadOne(
    modelId: string,
    onProgress?: (p: AIModelProgress) => void,
  ): Promise<void> {
    aiLog("AI_MODEL_LOADING", modelId);
    this.setStatus("downloading", 0, `Baixando ${modelId}…`, modelId);
    onProgress?.(this.getStatus());

    const webllm = await import("@mlc-ai/web-llm");
    const engine = await webllm.CreateMLCEngine(
      modelId,
      {
        initProgressCallback: (report) => {
          const progress = Math.min(1, Math.max(0, report.progress ?? 0));
          const phase: AIModelStatus =
            progress < 0.9 ? "downloading" : "loading";
          this.setStatus(
            phase,
            progress,
            report.text ||
              (phase === "downloading" ? "Baixando modelo…" : "Carregando…"),
            modelId,
          );
          onProgress?.(this.getStatus());
        },
      },
      {
        context_window_size: AI_CONTEXT_WINDOW_SIZE,
      },
    );

    this.engine = engine as EngineLike;
    this.loadedContextSize = AI_CONTEXT_WINDOW_SIZE;
    this.setStatus("ready", 1, "IA local pronta", modelId);
    aiLog("AI_MODEL_READY", `${modelId} ctx=${AI_CONTEXT_WINDOW_SIZE}`);
    onProgress?.(this.getStatus());
  }

  async unloadModel(opts?: { quiet?: boolean }): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch {
        /* ignore — device may already be lost */
      }
      this.engine = null;
    }
    this.loadedContextSize = 0;
    if (
      !opts?.quiet &&
      this.status.status !== "disabled" &&
      this.status.status !== "unsupported" &&
      this.status.status !== "error"
    ) {
      this.setStatus("idle", 0, "Modelo liberado");
    }
  }

  async clearCache(): Promise<void> {
    await this.unloadModel({ quiet: true });
    try {
      const webllm = await import("@mlc-ai/web-llm");
      const ids = new Set<string>([
        this.status.modelId ?? DEFAULT_AI_MODEL_ID,
        ...AI_MODEL_FALLBACK_CHAIN,
        "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      ]);
      for (const id of ids) {
        try {
          await webllm.deleteModelAllInfoInCache(id);
        } catch {
          /* ignore */
        }
      }
      aiLog("AI_CACHE_CLEARED", "all-fallback-models");
      if (!this.deviceDead) {
        this.setStatus("idle", 0, "Cache do modelo limpo");
      }
    } catch (e) {
      const friendly = friendlyAiError(e);
      const tech = rawAiError(e);
      this.setFailure("error", friendly, tech);
      aiLog("AI_MODEL_ERROR", tech);
      throw new Error(`${friendly}\n\nDetalhe: ${tech}`);
    }
  }

  async generate(
    messages: AIChatMessage[],
    options?: AIGenerateOptions,
  ): Promise<string> {
    if (this.generating) {
      return this.generating;
    }
    if (!this.engine || this.status.status !== "ready") {
      throw new Error("Modelo não está pronto");
    }

    this.generating = this.runGenerate(messages, options).finally(() => {
      this.generating = null;
    });
    return this.generating;
  }

  private async runGenerate(
    messages: AIChatMessage[],
    options?: AIGenerateOptions,
  ): Promise<string> {
    aiLog("AI_GENERATION_STARTED");
    this.setStatus("generating", 1, "Analisando…", this.status.modelId);

    try {
      const reply = await this.engine!.chat.completions.create({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 192,
        stream: false,
      });
      const text = reply.choices[0]?.message?.content?.trim() ?? "";
      this.setStatus("ready", 1, "IA local pronta", this.status.modelId);
      aiLog("AI_GENERATION_COMPLETED");
      return text;
    } catch (e) {
      const friendly = friendlyAiError(e);
      const tech = rawAiError(e);
      aiLog("AI_GENERATION_ERROR", tech);
      console.error("[AI] Falha na geração:", e);
      await this.unloadModel({ quiet: true });
      if (isGpuDeviceRemovedHard(e) || isGpuDeviceLostError(e)) {
        this.markDeviceDead(e);
      } else if (isContextWindowError(e)) {
        // Engine antigo com janela pequena — pede reload explícito
        this.setFailure("error", friendly, tech, this.status.modelId);
      } else {
        this.setFailure("error", friendly, tech, this.status.modelId);
      }
      throw new Error(`${friendly}\n\nDetalhe: ${tech}`);
    }
  }

  cancel(): void {
    // Não abortar GPU no meio — causa AbortError em GPUBuffer.
  }

  private markDeviceDead(error: unknown): void {
    this.deviceDead = true;
    this.engine = null;
    const friendly = friendlyAiError(error);
    const tech = rawAiError(error);
    this.setFailure("unsupported", friendly, tech);
    aiLog("AI_MODEL_ERROR", `device-dead: ${tech}`);
    console.error("[AI] GPU/WebGPU indisponível nesta sessão:", tech, error);
  }

  private setFailure(
    status: "error" | "unsupported" | "disabled",
    friendly: string,
    technical: string,
    modelId?: string,
  ): void {
    this.status = {
      status,
      progress: 0,
      message: friendly,
      error: friendly,
      technicalError: technical,
      modelId: modelId ?? this.status.modelId,
      runtime: this.status.runtime,
    };
  }

  private setStatus(
    status: AIModelStatus,
    progress: number,
    message?: string,
    modelId?: string,
  ): void {
    this.status = {
      status,
      progress,
      message,
      modelId: modelId ?? this.status.modelId,
      runtime: this.status.runtime,
      error:
        status === "error" || status === "unsupported" ? message : undefined,
      technicalError:
        status === "error" || status === "unsupported"
          ? this.status.technicalError
          : undefined,
    };
  }
}

let singleton: WebLLMProvider | null = null;

export function getWebLLMProvider(): WebLLMProvider {
  if (!singleton) singleton = new WebLLMProvider();
  return singleton;
}

export function resetWebLLMProviderForTests(): void {
  singleton = null;
}
