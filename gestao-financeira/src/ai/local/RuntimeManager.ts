"use client";

import {
  LOCAL_AI_DEFAULT_BASE_URL,
  LOCAL_AI_DEFAULT_MODEL,
  LOCAL_AI_STORAGE_DISABLED_KEY,
  type LocalAIHealth,
  type LocalAIStatus,
} from "./types";
import { HttpLocalAIClient } from "./HttpLocalAIClient";
import { MockLocalAIClient } from "./MockLocalAIClient";
import type { LocalAIClient } from "./types";

export type RuntimeProgress = {
  phase:
    | "idle"
    | "checking"
    | "pairing"
    | "starting"
    | "ready"
    | "unavailable"
    | "disabled"
    | "error";
  message: string;
  health?: LocalAIHealth;
  status?: LocalAIStatus;
  error?: string;
};

type Listener = (p: RuntimeProgress) => void;

/**
 * Orquestra health, pareamento e disponibilidade do runtime.
 * Não inicia processos do SO pelo browser (sem Node) — apenas detecta e orienta.
 * O script `npm run ai:runtime` sobe o processo separado.
 */
export class RuntimeManager {
  private client: HttpLocalAIClient;
  private mock: MockLocalAIClient;
  private useMock: boolean;
  private disabled = false;
  private progress: RuntimeProgress = {
    phase: "idle",
    message: "Assistente local não verificado",
  };
  private listeners = new Set<Listener>();

  constructor(opts?: { baseUrl?: string; useMock?: boolean }) {
    this.client = new HttpLocalAIClient({
      baseUrl: opts?.baseUrl ?? LOCAL_AI_DEFAULT_BASE_URL,
    });
    this.mock = new MockLocalAIClient();
    this.useMock =
      opts?.useMock ??
      (typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_AI_MOCK === "1");
    if (typeof window !== "undefined") {
      this.disabled = localStorage.getItem(LOCAL_AI_STORAGE_DISABLED_KEY) === "1";
    }
  }

  getClient(): LocalAIClient {
    if (this.useMock) return this.mock;
    return this.client;
  }

  getProgress(): RuntimeProgress {
    return { ...this.progress };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getProgress());
    return () => this.listeners.delete(fn);
  }

  private emit(p: Partial<RuntimeProgress>): void {
    this.progress = { ...this.progress, ...p };
    for (const fn of this.listeners) fn(this.getProgress());
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  setDisabled(value: boolean): void {
    this.disabled = value;
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_AI_STORAGE_DISABLED_KEY, value ? "1" : "0");
    }
    this.emit({
      phase: value ? "disabled" : "idle",
      message: value
        ? "Análise inteligente desativada"
        : "Assistente local pronto para verificar",
      error: undefined,
    });
  }

  setUseMock(value: boolean): void {
    this.useMock = value;
  }

  async healthCheck(): Promise<LocalAIHealth | null> {
    if (this.disabled) {
      this.emit({ phase: "disabled", message: "IA desativada" });
      return null;
    }
    if (this.useMock) {
      const h = await this.mock.healthCheck();
      this.emit({ phase: "ready", message: "Mock pronto", health: h });
      return h;
    }
    this.emit({ phase: "checking", message: "Verificando assistente local…" });
    try {
      const h = await this.client.healthCheck();
      this.emit({
        phase: h.runtime === "ready" ? "ready" : "unavailable",
        message:
          h.runtime === "ready"
            ? "Assistente local ativo"
            : "Assistente local respondendo, modelo ainda não pronto",
        health: h,
        error: undefined,
      });
      return h;
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Assistente local indisponível";
      this.emit({
        phase: "unavailable",
        message: msg,
        // Sem error no health passivo — evita banner vermelho só por abrir a página
        error: undefined,
      });
      return null;
    }
  }

  async ensureReady(): Promise<LocalAIClient> {
    if (this.disabled) {
      throw new Error("Análise inteligente desativada");
    }
    if (this.useMock) {
      this.emit({ phase: "ready", message: "Mock pronto" });
      return this.mock;
    }

    this.emit({ phase: "checking", message: "Verificando assistente local…" });
    let health: LocalAIHealth | null = null;
    try {
      health = await this.client.healthCheck();
    } catch {
      this.emit({
        phase: "unavailable",
        message:
          "Assistente local indisponível. Execute: npm run ai:runtime (com Ollama instalado).",
        error: "runtime_unreachable",
      });
      throw new Error(
        "Assistente local indisponível. Inicie o runtime (npm run ai:runtime).",
      );
    }

    if (!this.client.getToken()) {
      this.emit({ phase: "pairing", message: "Pareando com o runtime…" });
      try {
        await this.client.pair();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Falha no pareamento";
        this.emit({ phase: "error", message: msg, error: msg });
        throw new Error(msg);
      }
    }

    let status: LocalAIStatus;
    try {
      status = await this.client.getStatus();
    } catch (e) {
      // Token inválido — re-parear
      try {
        await this.client.pair();
        status = await this.client.getStatus();
      } catch {
        const msg =
          e instanceof Error ? e.message : "Falha ao obter status";
        this.emit({ phase: "error", message: msg, error: msg });
        throw new Error(msg);
      }
    }

    if (!status.model.loaded && !status.ollama?.reachable) {
      this.emit({
        phase: "unavailable",
        message:
          "Serviço Ollama não responde em 127.0.0.1:11434. Se já estiver instalado, reinicie o app Ollama (ou use Gerenciador IA → Iniciar Ollama).",
        status,
        error: "ollama_unreachable",
      });
      throw new Error(
        "Ollama instalado, mas a API não responde na porta 11434. Abra/reinicie o Ollama ou use Iniciar Ollama no Gerenciador da IA.",
      );
    }

    if (!status.model.loaded) {
      this.emit({
        phase: "unavailable",
        message: `Modelo não instalado. No terminal: ollama pull ${LOCAL_AI_DEFAULT_MODEL}`,
        status,
        error: "model_missing",
      });
      throw new Error(
        `O modelo ainda não foi instalado. Execute: ollama pull ${LOCAL_AI_DEFAULT_MODEL}`,
      );
    }

    this.emit({
      phase: "ready",
      message: "Assistente local pronto",
      health: health ?? undefined,
      status,
      error: undefined,
    });
    return this.client;
  }

  async runDiagnosticTest(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = await this.ensureReady();
      const { buildFinancialTestContext } = await import(
        "./AnalysisContextBuilder"
      );
      const ctx = buildFinancialTestContext();
      const result = await client.chat(
        ctx,
        "Resuma este cenário em uma frase.",
        { timeoutMs: 60_000 },
      );
      if (!result.text || result.text.length < 8) {
        return { ok: false, detail: "Resposta vazia ou inválida" };
      }
      return { ok: true, detail: result.text.slice(0, 200) };
    } catch (e) {
      return {
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  cancel(): void {
    this.getClient().cancel();
  }
}

let singleton: RuntimeManager | null = null;

export function getRuntimeManager(): RuntimeManager {
  if (!singleton) singleton = new RuntimeManager();
  return singleton;
}

export function resetRuntimeManagerForTests(): void {
  singleton = null;
}
