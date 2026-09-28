"use client";

import { getWebLLMProvider, type WebLLMProvider } from "../webllm/WebLLMProvider";
import {
  DEFAULT_AI_MODEL_ID,
  type AIChatMessage,
  type AIGenerateOptions,
  type AIModelProgress,
  type LocalAIProvider,
} from "./types";

const DISABLED_KEY = "gf-ai-disabled";

/**
 * Gerenciador de modelo — ponto único para UI e chat.
 * Não carrega no boot; só sob demanda.
 */
export class AIModelManager {
  private provider: WebLLMProvider;
  private listeners = new Set<(p: AIModelProgress) => void>();

  constructor(provider?: WebLLMProvider) {
    this.provider = provider ?? getWebLLMProvider();
    if (typeof window !== "undefined") {
      const disabled = localStorage.getItem(DISABLED_KEY) === "1";
      this.provider.setDisabled(disabled);
    }
  }

  getProvider(): LocalAIProvider {
    return this.provider;
  }

  getStatus(): AIModelProgress {
    return this.provider.getStatus();
  }

  subscribe(fn: (p: AIModelProgress) => void): () => void {
    this.listeners.add(fn);
    fn(this.getStatus());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const s = this.getStatus();
    for (const fn of this.listeners) fn(s);
  }

  isDisabled(): boolean {
    return this.getStatus().status === "disabled";
  }

  setDisabled(value: boolean): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISABLED_KEY, value ? "1" : "0");
    }
    this.provider.setDisabled(value);
    this.emit();
  }

  async ensureReady(modelId = DEFAULT_AI_MODEL_ID): Promise<void> {
    try {
      await this.provider.loadModel(modelId, () => this.emit());
      this.emit();
    } catch (e) {
      this.emit();
      console.error("[AI] ensureReady falhou:", e);
      throw e;
    }
  }

  async unload(): Promise<void> {
    await this.provider.unloadModel();
    this.emit();
  }

  async clearCache(): Promise<void> {
    await this.provider.clearCache();
    this.emit();
  }

  cancel(): void {
    this.provider.cancel();
    this.emit();
  }

  async generate(
    messages: AIChatMessage[],
    options?: AIGenerateOptions,
  ): Promise<string> {
    this.emit();
    try {
      const text = await this.provider.generate(messages, options);
      this.emit();
      return text;
    } catch (e) {
      this.emit();
      throw e;
    }
  }
}

let managerSingleton: AIModelManager | null = null;

export function getAIModelManager(): AIModelManager {
  if (!managerSingleton) managerSingleton = new AIModelManager();
  return managerSingleton;
}
