"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useVault } from "@/lib/vault-context";
import { AIConversationManager } from "@/ai/core/AIConversationManager";
import {
  classifyQuestionIntent,
  extractScenarioParams,
} from "@/ai/core/ContextSelector";
import type { AIModelProgress } from "@/ai/core/types";
import {
  buildFinancialContextFromSnapshot,
  getRuntimeManager,
  runtimeProgressToModelProgress,
} from "@/ai/local";
import { formatChatTextForDisplay } from "@/ai/local/formatAnalysis";
import type { FinancialAnalysis } from "@/ai/local/types";
import {
  analyzeBudgetOpportunities,
  analyzePortfolioForAI,
  buildDeterministicOverview,
  buildFinancialAlerts,
  buildFinancialInsights,
  buildFinancialPatterns,
  buildFinancialSnapshot,
  runCommonScenarios,
  scenarioExpenseCut,
  scenarioGoalRequired,
  scenarioIncomeChange,
  scenarioMonthlyContribution,
  type BudgetObjective,
  type FinancialAlertItem,
  type FinancialInsightItem,
  type FinancialSnapshot,
  type ScenarioResult,
} from "@/ai/finance";

interface AIContextValue {
  modelStatus: AIModelProgress;
  financialSnapshot: FinancialSnapshot | null;
  insights: FinancialInsightItem[];
  alerts: FinancialAlertItem[];
  patterns: FinancialInsightItem[];
  overviewText: string;
  /** JSON estruturado do runtime (null = só resumo determinístico). */
  runtimeAnalysis: FinancialAnalysis | null;
  scenarios: ScenarioResult[];
  chatTurns: { id: string; role: string; content: string }[];
  year: number;
  month: number;
  setPeriod: (year: number, month: number) => void;
  ensureModel: () => Promise<void>;
  clearModelCache: () => Promise<void>;
  setAIDisabled: (v: boolean) => void;
  refreshAnalysis: () => void;
  generateOverviewWithAI: () => Promise<string>;
  ask: (question: string) => Promise<string>;
  clearConversation: () => void;
  runBudget: (
    objective: BudgetObjective,
  ) => ReturnType<typeof analyzeBudgetOpportunities> | null;
  portfolioAnalysis: ReturnType<typeof analyzePortfolioForAI> | null;
  clearSessionAI: () => void;
  runDiagnosticTest: () => Promise<{ ok: boolean; detail: string }>;
}

const AIReactContext = createContext<AIContextValue | null>(null);

/** Remonta por usuário — isola contexto sem effects de limpeza. */
export function AIProviderGate({ children }: { children: ReactNode }) {
  const { activeProfile, status } = useVault();
  const key =
    status === "unlocked" && activeProfile
      ? `${activeProfile.id}:${activeProfile.vaultId}`
      : "locked";
  return <AIProvider key={key}>{children}</AIProvider>;
}

function AIProvider({ children }: { children: ReactNode }) {
  const { snapshot, status } = useVault();
  const runtime = getRuntimeManager();
  const [conversation] = useState(() => new AIConversationManager());
  const [modelStatus, setModelStatus] = useState<AIModelProgress>(() =>
    runtimeProgressToModelProgress(getRuntimeManager().getProgress()),
  );
  const initialYear = useMemo(() => new Date().getFullYear(), []);
  const initialMonth = useMemo(() => new Date().getMonth() + 1, []);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [runtimeAnalysis, setRuntimeAnalysis] =
    useState<FinancialAnalysis | null>(null);
  const [chatTurns, setChatTurns] = useState<
    { id: string; role: string; content: string }[]
  >([]);

  useEffect(() => {
    const unsub = runtime.subscribe((p) => {
      setModelStatus(runtimeProgressToModelProgress(p));
    });
    void runtime.healthCheck();
    return () => {
      runtime.cancel();
      conversation.clear();
      unsub();
    };
  }, [runtime, conversation]);

  const clearSessionAI = useCallback(() => {
    runtime.cancel();
    conversation.clear();
    setChatTurns([]);
    setAiOverview(null);
    setRuntimeAnalysis(null);
  }, [runtime, conversation]);

  const financialSnapshot = useMemo(() => {
    if (!snapshot || status !== "unlocked") return null;
    return buildFinancialSnapshot(snapshot, year, month, 12);
  }, [snapshot, year, month, status]);

  const insights = useMemo(
    () => (financialSnapshot ? buildFinancialInsights(financialSnapshot) : []),
    [financialSnapshot],
  );
  const alerts = useMemo(
    () => (financialSnapshot ? buildFinancialAlerts(financialSnapshot) : []),
    [financialSnapshot],
  );
  const patterns = useMemo(
    () => (financialSnapshot ? buildFinancialPatterns(financialSnapshot) : []),
    [financialSnapshot],
  );
  const scenarios = useMemo(
    () => (financialSnapshot ? runCommonScenarios(financialSnapshot) : []),
    [financialSnapshot],
  );
  const portfolioAnalysis = useMemo(
    () =>
      financialSnapshot ? analyzePortfolioForAI(financialSnapshot) : null,
    [financialSnapshot],
  );

  const deterministicOverview = useMemo(
    () =>
      financialSnapshot
        ? buildDeterministicOverview(financialSnapshot)
        : "",
    [financialSnapshot],
  );
  const overviewText = aiOverview ?? deterministicOverview;

  const ensureModel = useCallback(async () => {
    await runtime.ensureReady();
  }, [runtime]);

  const clearModelCache = useCallback(async () => {
    // Runtime gerencia modelos via Ollama — limpar token local apenas
    runtime.getClient().setToken(null);
    await runtime.healthCheck();
  }, [runtime]);

  const setAIDisabled = useCallback(
    (v: boolean) => {
      runtime.setDisabled(v);
    },
    [runtime],
  );

  const refreshAnalysis = useCallback(() => {
    setAiOverview(null);
    setRuntimeAnalysis(null);
  }, []);

  const generateOverviewWithAI = useCallback(async () => {
    if (!financialSnapshot) return overviewText;
    try {
      // Inferência só no runtime (localhost) — o app só formata o JSON
      const client = await runtime.ensureReady();
      const ctx = buildFinancialContextFromSnapshot(
        financialSnapshot,
        "overview",
      );
      const analysis = await client.analyze(ctx, { timeoutMs: 90_000 });
      setRuntimeAnalysis(analysis);
      setAiOverview(analysis.summary);
      return analysis.summary;
    } catch (e) {
      console.error("[AI] Narrar com runtime local falhou:", e);
      setRuntimeAnalysis(null);
      return overviewText;
    }
  }, [financialSnapshot, overviewText, runtime]);

  const ask = useCallback(
    async (question: string) => {
      if (!financialSnapshot) {
        throw new Error("Sem dados financeiros desbloqueados");
      }
      const intent = classifyQuestionIntent(question);
      let extra: Record<string, unknown> | undefined;
      let engineNote = "";

      if (intent === "scenario") {
        const params = extractScenarioParams(question);
        const results: ScenarioResult[] = [];
        const goal = financialSnapshot.goals[0];
        if (goal && /meta|guardar|atingir/i.test(question)) {
          results.push(
            scenarioGoalRequired({
              goalName: goal.name,
              remaining: goal.remaining,
              months: params.months ?? goal.deadlineMonths ?? 36,
            }),
          );
        }
        if (
          params.monthlyAmount &&
          /guardar|aportar|investir/i.test(question)
        ) {
          results.push(
            scenarioMonthlyContribution({
              monthlyAmount: params.monthlyAmount,
              months: params.months ?? 36,
            }),
          );
        }
        if (params.cutAmount || /reduzir|cortar/i.test(question)) {
          results.push(
            scenarioExpenseCut({
              currentSurplus: financialSnapshot.cashFlow.surplus,
              cutMonthly: params.cutAmount ?? params.monthlyAmount ?? 500,
              months: params.months ?? 12,
            }),
          );
        }
        if (params.incomeDeltaRatio != null) {
          results.push(
            scenarioIncomeChange({
              currentIncome: financialSnapshot.income.current,
              currentExpenses: financialSnapshot.expenses.current,
              incomeDeltaRatio: params.incomeDeltaRatio,
            }),
          );
        }
        if (results.length === 0) {
          results.push(...runCommonScenarios(financialSnapshot).slice(0, 2));
        }
        extra = { scenarioResults: results };
        engineNote = results
          .map(
            (r) =>
              `${r.title}: ${r.results.map((x) => `${x.label} ${x.value}`).join("; ")}`,
          )
          .join("\n");
      }

      if (intent === "budget") {
        extra = {
          budget: analyzeBudgetOpportunities(
            financialSnapshot,
            "increase_contribution",
          ),
        };
      }
      if (intent === "investments") {
        extra = { portfolio: analyzePortfolioForAI(financialSnapshot) };
      }
      if (intent === "alerts") {
        extra = { alerts: buildFinancialAlerts(financialSnapshot) };
      }
      if (intent === "patterns") {
        extra = { patterns: buildFinancialPatterns(financialSnapshot) };
      }

      conversation.addUser(question);
      setChatTurns(conversation.getTurns());

      if (
        modelStatus.status === "disabled" ||
        runtime.isDisabled()
      ) {
        const fallback =
          engineNote ||
          (intent === "overview"
            ? buildDeterministicOverview(financialSnapshot)
            : `Com base nos dados calculados (${intent}), consulte o painel Analista para evidências.`);
        conversation.addAssistant(fallback);
        setChatTurns(conversation.getTurns());
        return fallback;
      }

      try {
        const client = await runtime.ensureReady();
        const ctx = buildFinancialContextFromSnapshot(
          financialSnapshot,
          intent,
          { question, extras: extra },
        );
        const answer = await client.chat(ctx, question, { timeoutMs: 90_000 });
        // text já vem formatado pelo HttpLocalAIClient (JSON → prosa)
        const text = formatChatTextForDisplay(answer.text);
        conversation.addAssistant(text);
        setChatTurns(conversation.getTurns());
        return text;
      } catch (e) {
        console.error("[AI] Chat local falhou — fallback determinístico:", e);
        const fallback =
          engineNote ||
          buildDeterministicOverview(financialSnapshot) +
            "\n\n(Assistente local indisponível — resumo calculado pelo sistema.)";
        conversation.addAssistant(fallback);
        setChatTurns(conversation.getTurns());
        return fallback;
      }
    },
    [financialSnapshot, modelStatus.status, conversation, runtime],
  );

  const clearConversation = useCallback(() => {
    conversation.clear();
    setChatTurns([]);
  }, [conversation]);

  const runBudget = useCallback(
    (objective: BudgetObjective) => {
      if (!financialSnapshot) return null;
      return analyzeBudgetOpportunities(financialSnapshot, objective);
    },
    [financialSnapshot],
  );

  const runDiagnosticTest = useCallback(async () => {
    return runtime.runDiagnosticTest();
  }, [runtime]);

  const value: AIContextValue = {
    modelStatus,
    financialSnapshot,
    insights,
    alerts,
    patterns,
    overviewText,
    scenarios,
    chatTurns,
    year,
    month,
    setPeriod: (y, m) => {
      setYear(y);
      setMonth(m);
      setAiOverview(null);
      setRuntimeAnalysis(null);
    },
    ensureModel,
    clearModelCache,
    setAIDisabled,
    refreshAnalysis,
    generateOverviewWithAI,
    ask,
    clearConversation,
    runBudget,
    portfolioAnalysis,
    clearSessionAI,
    runDiagnosticTest,
    runtimeAnalysis,
  };

  return (
    <AIReactContext.Provider value={value}>{children}</AIReactContext.Provider>
  );
}

export function useAI(): AIContextValue {
  const ctx = useContext(AIReactContext);
  if (!ctx) {
    throw new Error("useAI must be used within AIProvider");
  }
  return ctx;
}
