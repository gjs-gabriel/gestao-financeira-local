import type {
  AnalyzeOptions,
  FinancialAnalysis,
  FinancialContext,
  LocalAIChatResult,
  LocalAIClient,
  LocalAIHealth,
  LocalAIModelInfo,
  LocalAIStatus,
} from "./types";
import { LOCAL_AI_RUNTIME_VERSION } from "./types";

/**
 * Cliente fictício para desenvolver a UI sem runtime instalado.
 * Não faz rede e não usa dados reais além do contexto recebido.
 */
export class MockLocalAIClient implements LocalAIClient {
  readonly id = "mock-local-ai";
  private token: string | null = "mock-token";
  private aborted = false;

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  async healthCheck(): Promise<LocalAIHealth> {
    return {
      status: "ok",
      runtime: "ready",
      model: "mock-financial-model",
      modelReady: true,
      version: LOCAL_AI_RUNTIME_VERSION,
      backend: "mock",
    };
  }

  async getStatus(): Promise<LocalAIStatus> {
    return {
      runtime: "running",
      model: {
        name: "mock-financial-model",
        loaded: true,
        quantization: "Q4",
        contextSize: 4096,
      },
      backend: "mock",
      message: "Modo desenvolvimento (mock)",
    };
  }

  async getModelInfo(): Promise<LocalAIModelInfo | null> {
    return {
      name: "mock-financial-model",
      quantization: "Q4",
      contextSize: 4096,
      sizeHint: "0 MB",
      minRamGb: 0,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async analyze(
    context: FinancialContext,
    _options?: AnalyzeOptions,
  ): Promise<FinancialAnalysis> {
    this.aborted = false;
    await delay(80);
    if (this.aborted) throw new Error("Análise cancelada");
    const { summary } = context;
    return {
      summary: `Panorama (mock): renda ${fmt(summary.income)}, despesas ${fmt(summary.expenses)}, fluxo ${fmt(summary.cashFlow)}, patrimônio ${fmt(summary.netWorth)}.`,
      insights: [
        {
          type: "cashflow",
          severity: "info",
          importance: "medium",
          title: "Fluxo do período",
          description: `Sobrou ${fmt(summary.cashFlow)} no período analisado (dados de teste/mock).`,
          evidence: [
            `Renda ${fmt(summary.income)}`,
            `Despesas ${fmt(summary.expenses)}`,
          ],
        },
      ],
      questions: ["O que mudou nas maiores categorias?"],
      recommendations: [
        "Revise categorias com variação acima da média dos últimos meses.",
      ],
      source: "mock",
    };
  }

  async chat(
    context: FinancialContext,
    question: string,
    _options?: AnalyzeOptions,
  ): Promise<LocalAIChatResult> {
    this.aborted = false;
    await delay(80);
    if (this.aborted) throw new Error("Análise cancelada");
    return {
      text: `Resposta mock à pergunta “${question.slice(0, 80)}”: com base no fluxo ${fmt(context.summary.cashFlow)} e patrimônio ${fmt(context.summary.netWorth)}, o panorama parece ${context.summary.cashFlow >= 0 ? "positivo" : "apertado"} neste período.`,
      source: "mock",
    };
  }

  cancel(): void {
    this.aborted = true;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
