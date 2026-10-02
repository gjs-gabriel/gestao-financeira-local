import {
  friendlyLocalAIError,
  LOCAL_AI_DEFAULT_BASE_URL,
  LOCAL_AI_STORAGE_TOKEN_KEY,
  type AnalyzeOptions,
  type FinancialAnalysis,
  type FinancialContext,
  type LocalAIChatResult,
  type LocalAIClient,
  type LocalAIClientOptions,
  type LocalAIHealth,
  type LocalAIModelInfo,
  type LocalAIStatus,
} from "./types";
import {
  formatChatTextForDisplay,
  normalizeFinancialAnalysis,
} from "./formatAnalysis";

/**
 * Cliente HTTP → Local AI Runtime em 127.0.0.1.
 * Nunca aponta para APIs de nuvem.
 */
export class HttpLocalAIClient implements LocalAIClient {
  readonly id = "http-local-ai";
  private baseUrl: string;
  private token: string | null;
  private timeoutMs: number;
  private abort: AbortController | null = null;

  constructor(options?: LocalAIClientOptions) {
    this.baseUrl = (options?.baseUrl ?? LOCAL_AI_DEFAULT_BASE_URL).replace(
      /\/$/,
      "",
    );
    // Token só em memória — nunca localStorage
    this.token = options?.token ?? null;
    this.timeoutMs = options?.timeoutMs ?? 90_000;
    // Migração: remover token legado inseguro se existir
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(LOCAL_AI_STORAGE_TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(LOCAL_AI_STORAGE_TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async healthCheck(): Promise<LocalAIHealth> {
    return this.getJson<LocalAIHealth>("/health", { auth: false });
  }

  async getStatus(): Promise<LocalAIStatus> {
    return this.getJson<LocalAIStatus>("/status");
  }

  async getModelInfo(): Promise<LocalAIModelInfo | null> {
    try {
      return await this.getJson<LocalAIModelInfo>("/model");
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const h = await this.healthCheck();
      return h.status === "ok" || h.runtime === "ready";
    } catch {
      return false;
    }
  }

  /** Emite sessão efêmera via POST /session (memória apenas). */
  async pair(): Promise<string> {
    const res = await this.requestJson<{ token: string; expiresIn?: number }>(
      "POST",
      "/session",
      {},
      { auth: false, timeoutMs: 8_000 },
    );
    if (!res.token) throw new Error("Sessão sem token");
    this.setToken(res.token);
    return res.token;
  }

  async analyze(
    context: FinancialContext,
    options?: AnalyzeOptions,
  ): Promise<FinancialAnalysis> {
    const data = await this.postJson<{ analysis?: unknown; summary?: string }>(
      "/analyze",
      { context },
      options,
    );
    // App formata o JSON do runtime — sem modelo no navegador
    return normalizeFinancialAnalysis(
      data.analysis ?? data,
      "local-runtime",
    );
  }

  async chat(
    context: FinancialContext,
    question: string,
    options?: AnalyzeOptions,
  ): Promise<LocalAIChatResult> {
    const data = await this.postJson<{ text: string; source?: string }>(
      "/chat",
      { context, question },
      options,
    );
    return {
      text: formatChatTextForDisplay(data.text ?? ""),
      source: (data.source as LocalAIChatResult["source"]) ?? "local-runtime",
    };
  }

  cancel(): void {
    this.abort?.abort();
    this.abort = null;
  }

  private async getJson<T>(
    path: string,
    opts?: { auth?: boolean },
  ): Promise<T> {
    return this.requestJson<T>("GET", path, undefined, {
      auth: opts?.auth !== false,
      timeoutMs: 8_000,
    });
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    options?: AnalyzeOptions,
  ): Promise<T> {
    return this.requestJson<T>("POST", path, body, {
      auth: true,
      timeoutMs: options?.timeoutMs ?? this.timeoutMs,
      signal: options?.signal,
    });
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { auth?: boolean; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<T> {
    if (!this.baseUrl.startsWith("http://127.0.0.1") &&
        !this.baseUrl.startsWith("http://localhost")) {
      throw new Error("LocalAIClient só pode falar com localhost");
    }

    this.abort?.abort();
    this.abort = new AbortController();
    const timeout = opts?.timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(() => this.abort?.abort(), timeout);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts?.auth !== false && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: opts?.signal ?? this.abort.signal,
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });

      if (!res.ok) {
        let detail = "";
        try {
          const j = (await res.json()) as { error?: string };
          detail = j.error ?? "";
        } catch {
          detail = await res.text().catch(() => "");
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("timeout");
      }
      throw new Error(friendlyLocalAIError(e));
    } finally {
      clearTimeout(timer);
    }
  }
}
