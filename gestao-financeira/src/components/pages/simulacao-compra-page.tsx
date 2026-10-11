"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  createId,
  cashflowLastMonths,
  DEFAULT_CDI_ANNUAL,
  DEFAULT_IR_RATE,
  formatBrl,
  MAX_PURCHASE_ALTERNATIVES,
  PURCHASE_MODE_LABELS,
  PURCHASE_MODE_OPTIONS,
  accountBalance,
  cardLimitUsage,
  formatYieldAssumptionsForInputs,
  inferSourceYieldAssumptions,
  recommendPurchaseStrategies,
  simulatePurchaseAlternatives,
  planPurchaseFromNaturalLanguage,
  parsePurchaseNlPlanFromAi,
  type PurchaseAltMode,
  type PurchaseNlPlan,
  type PurchaseSimulationResult,
  type PurchaseUrgency,
  type Goal,
} from "@/domain";
import { upsertEntity } from "@/domain/snapshot";
import { useVault } from "@/lib/vault-context";
import { useAI } from "@/ai/ui/AIProvider";
import { getRuntimeManager } from "@/ai/local/RuntimeManager";
import { buildFinancialContextFromSnapshot } from "@/ai/local/AnalysisContextBuilder";
import { formatChatTextForDisplay } from "@/ai/local/formatAnalysis";
import type { FinancialContext } from "@/ai/local/types";
import {
  buildInterpretationPrompt,
  buildPurchaseInterpretationTask,
  buildPurchaseNlTranslatePrompt,
  compactFactsJson,
} from "@/ai/prompts/FinancialSystemPrompt";
import {
  PageHeader,
  Section,
  Money,
  formatMoneyInput,
  parseMoneyInput,
} from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  Plus,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

type WizardStep = 1 | 2 | 3 | 4 | 5;

const WIZARD_STEPS: { step: WizardStep; title: string; short: string }[] = [
  { step: 1, title: "Descreva a compra", short: "Texto" },
  { step: 2, title: "Valores e estratégias", short: "Estratégias" },
  { step: 3, title: "Origem do dinheiro", short: "Aplicação" },
  { step: 4, title: "Confirmação", short: "Confirmar" },
  { step: 5, title: "Resultados", short: "Resultado" },
];

type AltDraft = {
  id: string;
  name: string;
  mode: PurchaseAltMode;
  amount: string;
  installments: string;
  monthlyOutflow: string;
  /** Residual / opção de compra (leasing). */
  residualAmount: string;
  /** Taxa a.m. em % (financiamento). */
  monthlyRatePct: string;
};

/** Quais inputs cada estratégia precisa — evita dois campos para o mesmo conceito. */
function altFields(mode: PurchaseAltMode): {
  showAmount: boolean;
  showMonthly: boolean;
  showResidual: boolean;
  showRate: boolean;
  /** amount espelha a mensalidade (assinatura / leasing). */
  amountMirrorsMonthly: boolean;
} {
  switch (mode) {
    case "subscription":
      return {
        showAmount: false,
        showMonthly: true,
        showResidual: false,
        showRate: false,
        amountMirrorsMonthly: true,
      };
    case "leasing":
      return {
        showAmount: false,
        showMonthly: true,
        showResidual: true,
        showRate: false,
        amountMirrorsMonthly: true,
      };
    case "installments_zero":
    case "installments_markup":
      // Parcela = total ÷ N — não pedir os dois
      return {
        showAmount: true,
        showMonthly: false,
        showResidual: false,
        showRate: false,
        amountMirrorsMonthly: false,
      };
    case "financing_interest":
      return {
        showAmount: true,
        showMonthly: false,
        showResidual: false,
        showRate: true,
        amountMirrorsMonthly: false,
      };
    case "consortium":
    case "cash_reverse":
    case "save_then_buy":
      return {
        showAmount: true,
        showMonthly: true,
        showResidual: false,
        showRate: false,
        amountMirrorsMonthly: false,
      };
  }
}

function FieldHint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={text}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-2 text-left text-[11px] leading-snug text-popover-foreground opacity-0 shadow-md transition-opacity group-hover/hint:opacity-100 group-focus-within/hint:opacity-100 sm:w-64"
      >
        {text}
      </span>
    </span>
  );
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  hint: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 leading-normal"
    >
      <span>{children}</span>
      <FieldHint text={hint} />
    </Label>
  );
}

function avgSavings(
  snapshot: NonNullable<ReturnType<typeof useVault>["snapshot"]>,
): number {
  const now = new Date();
  const series = cashflowLastMonths(
    snapshot,
    now.getFullYear(),
    now.getMonth() + 1,
    6,
  );
  if (series.length === 0) return 0;
  const sum = series.reduce((s, m) => s + (m.income - m.totalExpenses), 0);
  return Math.max(0, Math.round((sum / series.length) * 100) / 100);
}

function newAlt(partial?: Partial<AltDraft>): AltDraft {
  return {
    id: createId("alt"),
    name: "",
    mode: "cash_reverse",
    amount: "",
    installments: "12",
    monthlyOutflow: "",
    residualAmount: "",
    monthlyRatePct: "",
    ...partial,
  };
}

/** Nome no veredito/ranking: campo vazio → nome da estratégia. */
function altDisplayName(alt: Pick<AltDraft, "name" | "mode">): string {
  return alt.name.trim() || PURCHASE_MODE_LABELS[alt.mode];
}

function amountLabel(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Valor à vista";
    case "save_then_buy":
      return "Preço-alvo";
    case "consortium":
      return "Valor da carta / bem";
    case "installments_zero":
    case "installments_markup":
      return "Total a prazo";
    case "financing_interest":
      return "Valor financiado (principal)";
    case "subscription":
    case "leasing":
      return "Mensalidade";
  }
}

function installmentsLabel(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Meses de parcela reversa";
    case "installments_zero":
    case "installments_markup":
    case "financing_interest":
      return "Nº de parcelas";
    case "save_then_buy":
      return "Meses até a compra";
    case "consortium":
    case "leasing":
      return "Prazo do plano (meses)";
    case "subscription":
      return "Horizonte (meses)";
  }
}

function monthlyLabel(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Aporte mensal (parcela reversa)";
    case "installments_zero":
    case "installments_markup":
    case "financing_interest":
      return "Valor da parcela (opcional)";
    case "save_then_buy":
      return "Guarda mensal (opcional)";
    case "consortium":
      return "Mensalidade do consórcio";
    case "subscription":
      return "Mensalidade assinatura/locação";
    case "leasing":
      return "Mensalidade do leasing";
  }
}

function monthlyPlaceholder(mode: PurchaseAltMode): string {
  switch (mode) {
    case "installments_zero":
    case "installments_markup":
      return "Auto = total ÷ parcelas";
    case "financing_interest":
      return "Auto = Price (taxa × N)";
    case "save_then_buy":
      return "Auto = valor ÷ meses";
    case "cash_reverse":
      return "Vazio = auto · 0 = sem aporte";
    case "subscription":
    case "leasing":
    case "consortium":
      return "Informe a mensalidade";
    default:
      return "";
  }
}

function amountHint(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Preço se pagar agora (à vista). É o valor resgatado da aplicação.";
    case "installments_zero":
      return "Total do parcelamento sem juros (em geral = preço a prazo da loja/cartão). Parcela = total ÷ N.";
    case "installments_markup":
      return "Total que você pagará no cartão/loja com acréscimo embutido (maior que o Pix). A análise desconta essa diferença.";
    case "financing_interest":
      return "Principal financiado (em geral o valor à vista do bem). A taxa a.m. calcula a parcela e o custo total.";
    case "save_then_buy":
      return "Preço que você quer juntar antes de comprar.";
    case "consortium":
      return "Valor da carta de crédito / do bem no consórcio (não é a mensalidade).";
    case "subscription":
      return "Mensalidade da assinatura ou locação.";
    case "leasing":
      return "Mensalidade do leasing.";
  }
}

function installmentsHint(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Por quantos meses você “devolve” o dinheiro investindo a parcela reversa.";
    case "installments_zero":
    case "installments_markup":
    case "financing_interest":
      return "Quantidade de parcelas do plano.";
    case "save_then_buy":
      return "Em quantos meses você pretende juntar o valor e comprar.";
    case "consortium":
    case "leasing":
      return "Duração do plano em meses.";
    case "subscription":
      return "Quantos meses projetar o uso (horizonte da simulação).";
  }
}

function monthlyHint(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Quanto você reinveste por mês na origem. Vazio = calcula sozinho (a prazo ÷ meses). 0 = sem aporte (só resgata à vista).";
    case "installments_zero":
    case "installments_markup":
      return "Valor de cada parcela. Se vazio, usa total ÷ número de parcelas.";
    case "financing_interest":
      return "Parcela calculada pela taxa (Price). Só preencha se quiser forçar um valor.";
    case "save_then_buy":
      return "Quanto você guarda por mês para a compra. Se vazio, usa preço ÷ meses.";
    case "consortium":
      return "Mensalidade do consórcio que sai do seu fluxo de caixa.";
    case "subscription":
      return "Quanto você paga por mês pelo uso (assinatura/locação), sem comprar o bem.";
    case "leasing":
      return "Mensalidade do leasing. Pode haver residual no fim do contrato.";
  }
}

/** Tooltip do campo Estratégia — explica a opção atualmente selecionada. */
function strategyHint(mode: PurchaseAltMode): string {
  switch (mode) {
    case "cash_reverse":
      return "Você paga o bem à vista (resgata da aplicação/conta) e, em vez de pagar parcelas a um banco ou loja, reinveste esse valor todo mês na mesma origem — a “parcela reversa”. O dinheiro volta a render com você.";
    case "installments_zero":
      return "Você parcela sem juros (cartão/crediário) e mantém o saldo na aplicação. As parcelas saem do fluxo mensal; o dinheiro investido continua rendendo, sem o resgate à vista.";
    case "installments_markup":
      return "Parcelamento da loja/cartão em que o total a prazo é maior que o Pix (acréscimo embutido). Informe o total; a simulação desconta esse custo no ranking.";
    case "financing_interest":
      return "Financiamento bancário com taxa de juros a.m. Informe o principal e a taxa — o app calcula a parcela (Price) e o custo total vs o à vista.";
    case "save_then_buy":
      return "Você ainda não compra: guarda um valor por mês até juntar o preço-alvo e só então adquire o bem. Útil quando dá para esperar e evitar juros.";
    case "consortium":
      return "Você entra num consórcio: paga mensalidade por um prazo e recebe a carta/bem quando for contemplado (aqui modelado ao fim do plano). Não é financiamento tradicional.";
    case "subscription":
      return "Você não compra o bem: paga uma mensalidade pelo uso (assinatura ou locação) durante o horizonte. Não há propriedade ao final.";
    case "leasing":
      return "Leasing: mensalidade pelo uso do bem por um prazo, com opção de residual/compra no fim do contrato. Parecido com aluguel de longo prazo com possível aquisição.";
  }
}

function defaultAlternatives(): AltDraft[] {
  return [];
}

function seedAltForMode(
  mode: PurchaseAltMode,
  cash: string,
  financed: string,
  n: string,
): AltDraft {
  const vista = cash.trim() || "0";
  const prazo = financed.trim() || vista;
  const parcels = n.trim() || "12";
  switch (mode) {
    case "cash_reverse":
      return newAlt({
        mode,
        amount: vista,
        installments: parcels,
        monthlyOutflow: "",
      });
    case "installments_zero":
      return newAlt({ mode, amount: prazo, installments: parcels });
    case "installments_markup":
      return newAlt({
        mode,
        amount: prazo,
        installments: parcels,
      });
    case "financing_interest":
      return newAlt({
        mode,
        amount: vista,
        installments: parcels,
        monthlyRatePct: "1,79",
      });
    case "subscription":
    case "leasing": {
      const fee = formatMoneyInput(parseMoneyInput(vista) * 0.03);
      return newAlt({
        mode,
        amount: fee,
        monthlyOutflow: fee,
        installments: mode === "leasing" ? "24" : "12",
      });
    }
    case "consortium":
      return newAlt({
        mode,
        amount: vista,
        installments: "36",
        monthlyOutflow: "",
      });
    case "save_then_buy":
      return newAlt({
        mode,
        amount: vista,
        installments: "12",
        monthlyOutflow: "",
      });
  }
}

type FundingSource = {
  key: string;
  kind: "investment" | "account";
  id: string;
  name: string;
  balance: number;
  classificationOrType?: string;
  notes?: string;
  rawName?: string;
  group: string;
};

export function SimulacaoCompraPage() {
  const { snapshot, updateSnapshot } = useVault();
  const { modelStatus, ensureModel, financialSnapshot } = useAI();

  const fundingSources = useMemo((): FundingSource[] => {
    if (!snapshot) return [];
    const invs: FundingSource[] = (snapshot.investments ?? [])
      .filter((i) => (i.lifecycle ?? "active") !== "closed" && i.amount > 0)
      .map((i) => ({
        key: `inv:${i.id}`,
        kind: "investment" as const,
        id: i.id,
        name: i.name,
        balance: i.amount,
        classificationOrType: i.classification,
        notes: i.notes,
        rawName: i.rawName,
        group: "Aplicações",
      }));
    const accs: FundingSource[] = (snapshot.accounts ?? [])
      .filter((a) => a.status === "active")
      .map((a) => ({
        key: `acc:${a.id}`,
        kind: "account" as const,
        id: a.id,
        name: a.name,
        balance: accountBalance(a, snapshot.transactions ?? []),
        classificationOrType: a.type,
        notes: a.notes,
        group: "Contas",
      }))
      .filter((a) => a.balance > 0);
    return [...invs, ...accs];
  }, [snapshot]);

  const cardLiquidity = useMemo(() => {
    if (!snapshot) return [];
    return (snapshot.creditCards ?? [])
      .filter((c) => c.status === "active")
      .map((c) => {
        const usage = cardLimitUsage(c, snapshot);
        return {
          id: c.id,
          name: c.name,
          available: usage.available,
          limit: usage.limit,
        };
      });
  }, [snapshot]);

  const defaultSavings = snapshot ? avgSavings(snapshot) : 0;

  const [sourceKey, setSourceKey] = useState<string>("");
  const [pctOfCdi, setPctOfCdi] = useState("100");
  const [cdiAnnualPct, setCdiAnnualPct] = useState(
    String(Math.round(DEFAULT_CDI_ANNUAL * 10000) / 100).replace(".", ","),
  );
  const [irPct, setIrPct] = useState(
    String(Math.round(DEFAULT_IR_RATE * 1000) / 10).replace(".", ","),
  );
  const [monthlySavings, setMonthlySavings] = useState(
    defaultSavings > 0 ? String(defaultSavings).replace(".", ",") : "750",
  );
  const [sourceHint, setSourceHint] = useState<string | null>(null);
  const [cashPrice, setCashPrice] = useState("8000");
  const [financedTotal, setFinancedTotal] = useState("9000");
  const [maxInstallments, setMaxInstallments] = useState("10");
  const [urgency, setUrgency] = useState<PurchaseUrgency>("media");
  const [nlStrategy, setNlStrategy] = useState("");
  const [alternatives, setAlternatives] = useState<AltDraft[]>(defaultAlternatives);
  const [result, setResult] = useState<PurchaseSimulationResult | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>(1);

  function applyNlPlan(plan: PurchaseNlPlan) {
    if (plan.cashPrice != null && plan.cashPrice > 0) {
      setCashPrice(formatMoneyInput(plan.cashPrice));
    }
    if (plan.financedTotal != null && plan.financedTotal > 0) {
      setFinancedTotal(formatMoneyInput(plan.financedTotal));
    }
    if (plan.maxInstallments != null && plan.maxInstallments >= 1) {
      setMaxInstallments(String(plan.maxInstallments));
    }
    if (plan.urgency) setUrgency(plan.urgency);

    setAlternatives(
      plan.alternatives.map((a) => {
        const fields = altFields(a.mode);
        const fee =
          a.monthlyOutflow != null && a.monthlyOutflow > 0
            ? String(a.monthlyOutflow)
            : String(a.amount);
        return newAlt({
          mode: a.mode,
          name: a.label?.trim() || PURCHASE_MODE_LABELS[a.mode],
          amount: fields.amountMirrorsMonthly
            ? formatMoneyInput(Number(fee))
            : formatMoneyInput(a.amount),
          installments: String(a.installments),
          monthlyOutflow: fields.showMonthly
            ? a.monthlyOutflow != null && a.monthlyOutflow > 0
              ? formatMoneyInput(a.monthlyOutflow)
              : fields.amountMirrorsMonthly
                ? formatMoneyInput(Number(fee))
                : ""
            : "",
          residualAmount:
            a.residualAmount != null && a.residualAmount > 0
              ? formatMoneyInput(a.residualAmount)
              : "",
          monthlyRatePct:
            a.monthlyRatePct != null && a.monthlyRatePct > 0
              ? formatMoneyInput(a.monthlyRatePct)
              : "",
        });
      }),
    );
    setResult(null);
    setAiText(null);
  }

  function applySource(source: FundingSource) {
    setSourceKey(source.key);
    const assumptions = inferSourceYieldAssumptions(
      {
        kind: source.kind,
        name: source.name,
        notes: source.notes,
        rawName: source.rawName,
        classificationOrType: source.classificationOrType,
      },
      { cdiAnnual: DEFAULT_CDI_ANNUAL },
    );
    const formatted = formatYieldAssumptionsForInputs(assumptions);
    setPctOfCdi(formatted.pctOfCdi);
    setCdiAnnualPct(formatted.cdiAnnualPct);
    setIrPct(formatted.irPct);
    setSourceHint(assumptions.hint);
    if (snapshot) {
      const sav = avgSavings(snapshot);
      setMonthlySavings(
        sav > 0 ? String(sav).replace(".", ",") : monthlySavings || "750",
      );
    }
  }

  function onSelectSource(key: string) {
    const source = fundingSources.find((s) => s.key === key);
    if (!source) return;
    applySource(source);
  }

  useEffect(() => {
    if (!snapshot || fundingSources.length === 0) return;
    const stillValid = fundingSources.some((s) => s.key === sourceKey);
    if (!sourceKey || !stillValid) {
      // Prefere maior saldo em renda fixa; senão o maior saldo geral.
      const preferred =
        fundingSources.find((s) => s.classificationOrType === "renda_fixa") ??
        [...fundingSources].sort((a, b) => b.balance - a.balance)[0];
      if (preferred) applySource(preferred);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.updatedAt, fundingSources.length]);

  const selectedSource = fundingSources.find((s) => s.key === sourceKey);

  if (!snapshot) {
    return (
      <div>
        <PageHeader
          title="Simulação de compra"
          description="Desbloqueie o cofre para simular o impacto no patrimônio."
        />
      </div>
    );
  }

  function updateAlt(id: string, patch: Partial<AltDraft>) {
    setAlternatives((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function addAlternative() {
    if (alternatives.length >= MAX_PURCHASE_ALTERNATIVES) return;
    setAlternatives((prev) => [
      ...prev,
      newAlt({
        mode: "installments_markup",
        amount: financedTotal || "10000",
        installments: maxInstallments || "12",
      }),
    ]);
  }

  function buildContextBase() {
    const pct = Number(pctOfCdi.replace(",", "."));
    const cdi = Number(cdiAnnualPct.replace(",", ".")) / 100;
    const ir = Number(irPct.replace(",", ".")) / 100;
    const savings = parseMoneyInput(monthlySavings);
    const source = fundingSources.find((s) => s.key === sourceKey);
    return { pct, cdi, ir, savings, source };
  }

  function removeAlternative(id: string) {
    setAlternatives((prev) => prev.filter((a) => a.id !== id));
  }

  function toggleStrategyMode(mode: PurchaseAltMode, enabled: boolean) {
    if (enabled) {
      setAlternatives((prev) => {
        if (prev.some((a) => a.mode === mode)) return prev;
        if (prev.length >= MAX_PURCHASE_ALTERNATIVES) return prev;
        return [
          ...prev,
          seedAltForMode(mode, cashPrice, financedTotal, maxInstallments),
        ];
      });
      return;
    }
    setAlternatives((prev) => prev.filter((a) => a.mode !== mode));
  }

  function goBack() {
    setMsg(null);
    setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s));
  }

  function goTo(next: WizardStep) {
    setMsg(null);
    setStep(next);
  }

  function runSimulation(): boolean {
    setMsg(null);
    setAiText(null);
    const { pct, cdi, ir, savings, source } = buildContextBase();

    if (!source) {
      setMsg("Selecione a aplicação ou conta de origem do dinheiro.");
      return false;
    }
    if (!Number.isFinite(pct) || pct < 0) {
      setMsg("Informe o % do CDI (0 = sem rendimento).");
      return false;
    }

    const parsedAlts = alternatives.map((a) => {
      const fields = altFields(a.mode);
      const amountRaw = parseMoneyInput(a.amount);
      const installments = Math.max(
        1,
        Math.floor(Number(a.installments.replace(",", ".")) || 1),
      );
      const monthlyRaw = a.monthlyOutflow.trim()
        ? parseMoneyInput(a.monthlyOutflow)
        : undefined;
      const residualRaw = a.residualAmount.trim()
        ? parseMoneyInput(a.residualAmount)
        : undefined;
      const rateRaw = a.monthlyRatePct.trim()
        ? Number(a.monthlyRatePct.replace(",", "."))
        : undefined;

      if (fields.amountMirrorsMonthly) {
        const fee = monthlyRaw && monthlyRaw > 0 ? monthlyRaw : amountRaw;
        return {
          id: a.id,
          name: altDisplayName(a),
          mode: a.mode,
          amount: fee,
          installments,
          monthlyOutflow: fee,
          residualAmount:
            a.mode === "leasing" && residualRaw && residualRaw > 0
              ? residualRaw
              : undefined,
        };
      }

      // Parcelado / financiamento: sem campo de parcela duplicado
      if (!fields.showMonthly) {
        return {
          id: a.id,
          name: altDisplayName(a),
          mode: a.mode,
          amount: amountRaw,
          installments,
          monthlyRatePct:
            fields.showRate &&
            rateRaw != null &&
            Number.isFinite(rateRaw) &&
            rateRaw > 0
              ? rateRaw
              : undefined,
        };
      }

      return {
        id: a.id,
        name: altDisplayName(a),
        mode: a.mode,
        amount: amountRaw,
        installments,
        monthlyOutflow: monthlyRaw,
      };
    });

    const invalid = parsedAlts.some((a) => {
      const fields = altFields(a.mode);
      if (fields.amountMirrorsMonthly) {
        return !(a.monthlyOutflow != null && a.monthlyOutflow > 0);
      }
      if (a.mode === "consortium") {
        return (
          a.amount <= 0 ||
          !(a.monthlyOutflow != null && a.monthlyOutflow > 0)
        );
      }
      if (a.mode === "financing_interest") {
        return (
          a.amount <= 0 ||
          !(a.monthlyRatePct != null && a.monthlyRatePct > 0)
        );
      }
      return a.amount <= 0;
    });
    if (invalid) {
      setMsg(
        "Cada alternativa precisa dos valores obrigatórios da estratégia (maiores que zero). No financiamento, informe a taxa a.m.",
      );
      return false;
    }
    if (parsedAlts.length < 1) {
      setMsg("Defina pelo menos uma alternativa de compra.");
      return false;
    }

    const vista = parseMoneyInput(cashPrice);
    const prazo = parseMoneyInput(financedTotal);

    const sim = simulatePurchaseAlternatives(
      {
        investmentName: source.name,
        investmentBalance: source.balance,
        pctOfCdi: pct,
        cdiAnnual: Number.isFinite(cdi) && cdi > 0 ? cdi : DEFAULT_CDI_ANNUAL,
        irRate: Number.isFinite(ir) && ir >= 0 ? ir : DEFAULT_IR_RATE,
        monthlySavings: savings,
        horizonMonths: 12,
        referenceCashPrice: vista > 0 ? vista : undefined,
        referenceFinancedTotal: prazo > 0 ? prazo : undefined,
        maxInterestFreeInstallments: Math.max(
          1,
          Math.floor(Number(maxInstallments.replace(",", ".")) || 1),
        ),
        urgency,
        cards: cardLiquidity,
      },
      parsedAlts,
    );
    setResult(sim);
    return true;
  }

  function fillSuggestedStrategies() {
    setMsg(null);
    setAiText(null);
    const { pct, cdi, ir, savings, source } = buildContextBase();
    const vista = parseMoneyInput(cashPrice);
    const prazo = parseMoneyInput(financedTotal);
    const n = Math.max(
      1,
      Math.floor(Number(maxInstallments.replace(",", ".")) || 1),
    );
    if (vista <= 0) {
      setMsg("Informe o valor à vista para sugerir estratégias.");
      return;
    }
    const sim = recommendPurchaseStrategies({
      investmentName: source?.name ?? "Origem",
      investmentBalance: source?.balance ?? Math.max(vista * 3, 20_000),
      pctOfCdi: Number.isFinite(pct) && pct >= 0 ? pct : 100,
      cdiAnnual: Number.isFinite(cdi) && cdi > 0 ? cdi : DEFAULT_CDI_ANNUAL,
      irRate: Number.isFinite(ir) && ir >= 0 ? ir : DEFAULT_IR_RATE,
      monthlySavings: savings,
      horizonMonths: 12,
      cashPrice: vista,
      financedTotal: prazo > 0 ? prazo : vista,
      maxInstallments: n,
      urgency,
    });
    setAlternatives(
      sim.alternatives.map((a) => {
        const fields = altFields(a.mode);
        const fee =
          a.monthlyOutflow > 0 ? a.monthlyOutflow : a.amount;
        return newAlt({
          id: a.id,
          name: a.name,
          mode: a.mode,
          amount:
            a.mode === "financing_interest"
              ? cashPrice || formatMoneyInput(a.amount)
              : fields.amountMirrorsMonthly
                ? formatMoneyInput(fee)
                : formatMoneyInput(a.amount),
          installments: String(a.installments),
          monthlyOutflow: fields.showMonthly
            ? a.monthlyOutflow > 0
              ? formatMoneyInput(a.monthlyOutflow)
              : fields.amountMirrorsMonthly
                ? formatMoneyInput(fee)
                : ""
            : "",
          residualAmount:
            a.residualAmount > 0 ? formatMoneyInput(a.residualAmount) : "",
          monthlyRatePct:
            a.monthlyRatePct != null && a.monthlyRatePct > 0
              ? formatMoneyInput(a.monthlyRatePct)
              : "",
        });
      }),
    );
    setResult(null);
    setMsg(
      `${sim.alternatives.length} estratégias sugeridas — revise e continue.`,
    );
  }

  async function translateNlStrategy(): Promise<boolean> {
    const text = nlStrategy.trim();
    if (text.length < 8) {
      setMsg(
        "Descreva a compra em linguagem natural (ex.: “Quero comparar Pix de R$ 8.000 com 10× de R$ 9.000”), ou pule e preencha na próxima tela.",
      );
      return false;
    }
    setBusy(true);
    setMsg(null);
    setAiText(null);
    const localFallback = () =>
      planPurchaseFromNaturalLanguage(text, {
        cashPrice: parseMoneyInput(cashPrice) || undefined,
        financedTotal: parseMoneyInput(financedTotal) || undefined,
        maxInstallments:
          Math.floor(Number(maxInstallments.replace(",", ".")) || 0) ||
          undefined,
        urgency,
      });

    try {
      let plan: PurchaseNlPlan | null = null;
      try {
        await ensureModel();
        const client = await getRuntimeManager().ensureReady();
        const prompt = buildPurchaseNlTranslatePrompt(text);
        const ctx: FinancialContext = financialSnapshot
          ? buildFinancialContextFromSnapshot(financialSnapshot, "chat", {
              question: prompt,
            })
          : {
              version: 1,
              intent: "chat",
              period: { start: "2026-01-01", end: "2026-01-31" },
              summary: {
                income: 0,
                expenses: 0,
                cashFlow: 0,
                netWorth: 0,
                savingsRate: 0,
                commitmentRatio: 0,
              },
              question: prompt,
              extras: { task: "purchase_nl_translate" },
            };
        const answer = await client.chat(ctx, prompt, { timeoutMs: 90_000 });
        plan = parsePurchaseNlPlanFromAi(answer.text ?? "");
      } catch {
        plan = null;
      }

      const localPlan = localFallback();
      if (!plan || plan.alternatives.length === 0) {
        plan = localPlan;
      } else if (localPlan.alternatives.length >= plan.alternatives.length) {
        // Preferir leitura local em empate/mais opções (evita IA com parcela errada)
        plan = localPlan;
      }
      if (plan.alternatives.length === 0) {
        setMsg(
          "Não consegui extrair alternativas do texto. Inclua valores (à vista/a prazo) e a estratégia desejada.",
        );
        return false;
      }

      applyNlPlan(plan);
      const via = plan.source === "ai" ? "Analista local" : "leitura local do texto";
      setMsg(
        `${plan.alternatives.length} alternativa(s) preenchida(s) via ${via}. Revise na próxima etapa.`,
      );
      return true;
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Falha ao traduzir a estratégia. Tente de novo ou preencha manualmente.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function enrichWithAI() {
    if (!result) return;
    if (!financialSnapshot) {
      setMsg("Desbloqueie o cofre para interpretar com o Analista.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setAiText(null);
    try {
      await ensureModel();
      const client = await getRuntimeManager().ensureReady();
      const facts = compactFactsJson(result.facts, 3500);
      const prompt = buildInterpretationPrompt(
        buildPurchaseInterpretationTask(),
        facts,
      );
      const ctx = buildFinancialContextFromSnapshot(
        financialSnapshot,
        "overview",
        { question: prompt },
      );
      const answer = await client.chat(ctx, prompt, { timeoutMs: 90_000 });
      const text = formatChatTextForDisplay(answer.text ?? "");
      if (!text || text.length < 8) {
        throw new Error("O Analista respondeu vazio — tente de novo.");
      }
      setAiText(text);
      setMsg("Interpretação gerada abaixo.");
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Assistente local indisponível — use o relatório calculado. Abra Gerenciador IA se precisar conectar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createReplenishGoal() {
    if (!result?.automation) {
      setMsg(
        "Não há meta sugerida (aparece com parcela reversa ou acúmulo prévio).",
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const now = new Date().toISOString();
      const deadline = new Date();
      deadline.setMonth(deadline.getMonth() + result.automation.months);
      const goal: Goal = {
        id: createId("goal"),
        name: result.automation.goalName,
        targetAmount: result.automation.targetAmount,
        currentAmount: 0,
        deadline: deadline.toISOString().slice(0, 10),
        notes: `Aporte sugerido: ${formatBrl(result.automation.monthlyAmount)}/mês (simulação de compra).`,
        createdAt: now,
        updatedAt: now,
      };
      await updateSnapshot((s) => upsertEntity(s, "goals", goal));
      setMsg(
        `Meta "${goal.name}" criada (${formatBrl(goal.targetAmount)}). Abra Metas no menu para ver.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao criar meta");
    } finally {
      setBusy(false);
    }
  }

  const timelineMonths = [0, 3, 6, 12];
  const timelineAlts = result
    ? result.ranking
        .map((r) => result.alternatives.find((a) => a.id === r.id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
    : [];

  const selectedModes = new Set(alternatives.map((a) => a.mode));
  const stepMeta = WIZARD_STEPS.find((s) => s.step === step)!;
  const urgencyLabel =
    urgency === "baixa" ? "Baixa" : urgency === "alta" ? "Alta" : "Média";

  function WizardNav({
    onNext,
    nextLabel = "Continuar",
    nextDisabled = false,
    showBack = true,
  }: {
    onNext?: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
    showBack?: boolean;
  }) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {showBack && step > 1 ? (
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={goBack}
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
        ) : null}
        {onNext ? (
          <Button
            type="button"
            className="gap-1.5"
            disabled={nextDisabled || busy}
            onClick={onNext}
          >
            {nextLabel}
            <ArrowRight className="size-4" />
          </Button>
        ) : null}
      </div>
    );
  }

  function renderAltEditor() {
    return (
      <ul className="space-y-4">
        {alternatives.map((alt, index) => (
          <li
            key={alt.id}
            className="rounded-xl border border-border/60 bg-card/40 p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium leading-normal">
                Alternativa {index + 1}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => removeAlternative(alt.id)}
              >
                <Trash2 className="size-3.5" />
                Remover
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <FieldLabel hint="Nome no ranking e na linha do tempo. Se vazio, usa o nome da estratégia.">
                  Nome amigável
                </FieldLabel>
                <Input
                  value={alt.name}
                  onChange={(e) =>
                    updateAlt(alt.id, { name: e.target.value })
                  }
                  placeholder={PURCHASE_MODE_LABELS[alt.mode]}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel hint={strategyHint(alt.mode)}>
                  Estratégia
                </FieldLabel>
                <Select
                  value={alt.mode}
                  onValueChange={(v) => {
                    if (!v || !(PURCHASE_MODE_OPTIONS as string[]).includes(v))
                      return;
                    const mode = v as PurchaseAltMode;
                    const fields = altFields(mode);
                    if (fields.amountMirrorsMonthly) {
                      const fee =
                        alt.monthlyOutflow.trim() || alt.amount || "0";
                      updateAlt(alt.id, {
                        mode,
                        amount: fee,
                        monthlyOutflow: fee,
                      });
                      return;
                    }
                    updateAlt(alt.id, { mode });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) =>
                        v && v in PURCHASE_MODE_LABELS
                          ? PURCHASE_MODE_LABELS[v as PurchaseAltMode]
                          : "Escolha a estratégia"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className="min-w-[18rem] max-w-[min(100vw-2rem,28rem)] bg-popover"
                  >
                    {PURCHASE_MODE_OPTIONS.map((mode) => (
                      <SelectItem
                        key={mode}
                        value={mode}
                        label={PURCHASE_MODE_LABELS[mode]}
                        className="items-start whitespace-normal"
                      >
                        <span className="line-clamp-2 text-left leading-snug">
                          {PURCHASE_MODE_LABELS[mode]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {altFields(alt.mode).showAmount ? (
                <div className="space-y-1.5">
                  <FieldLabel hint={amountHint(alt.mode)}>
                    {amountLabel(alt.mode)}
                  </FieldLabel>
                  <Input
                    value={alt.amount}
                    onChange={(e) =>
                      updateAlt(alt.id, { amount: e.target.value })
                    }
                    inputMode="decimal"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <FieldLabel hint={installmentsHint(alt.mode)}>
                  {installmentsLabel(alt.mode)}
                </FieldLabel>
                <Input
                  value={alt.installments}
                  onChange={(e) =>
                    updateAlt(alt.id, { installments: e.target.value })
                  }
                  inputMode="numeric"
                />
              </div>
              {altFields(alt.mode).showRate ? (
                <div className="space-y-1.5">
                  <FieldLabel hint="Taxa de juros do financiamento ao mês (ex.: 1,79).">
                    Taxa a.m. (%)
                  </FieldLabel>
                  <Input
                    value={alt.monthlyRatePct}
                    onChange={(e) =>
                      updateAlt(alt.id, { monthlyRatePct: e.target.value })
                    }
                    inputMode="decimal"
                    placeholder="Ex.: 1,79"
                  />
                </div>
              ) : null}
              {altFields(alt.mode).showMonthly ? (
                <div className="space-y-1.5">
                  <FieldLabel hint={monthlyHint(alt.mode)}>
                    {monthlyLabel(alt.mode)}
                  </FieldLabel>
                  <Input
                    value={alt.monthlyOutflow}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (altFields(alt.mode).amountMirrorsMonthly) {
                        updateAlt(alt.id, {
                          monthlyOutflow: value,
                          amount: value,
                        });
                        return;
                      }
                      updateAlt(alt.id, { monthlyOutflow: value });
                    }}
                    inputMode="decimal"
                    placeholder={monthlyPlaceholder(alt.mode)}
                  />
                </div>
              ) : null}
              {altFields(alt.mode).showResidual ? (
                <div className="space-y-1.5">
                  <FieldLabel hint="Valor da opção de compra no fim do contrato (residual).">
                    Residual / opção de compra
                  </FieldLabel>
                  <Input
                    value={alt.residualAmount}
                    onChange={(e) =>
                      updateAlt(alt.id, { residualAmount: e.target.value })
                    }
                    inputMode="decimal"
                    placeholder="Opcional"
                  />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <PageHeader
        title="Simulação de compra"
        description="Fluxo guiado — compare estratégias no dispositivo, sem nuvem."
        action={
          <Link
            href="/analista"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent/50"
          >
            <Sparkles className="size-3.5" />
            Analista
          </Link>
        }
      />

      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Passo {step} de 5 · {stepMeta.title}
          </p>
          <p className="text-xs text-muted-foreground">{stepMeta.short}</p>
        </div>
        <div className="flex gap-1">
          {WIZARD_STEPS.map((s) => (
            <button
              key={s.step}
              type="button"
              title={s.title}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s.step <= step ? "bg-primary" : "bg-muted"
              }`}
              onClick={() => {
                if (s.step < step || (s.step === 5 && result)) goTo(s.step);
              }}
            />
          ))}
        </div>
      </div>

      {msg && step !== 5 ? (
        <Alert
          className="mb-4"
          variant={
            /Falha|Informe|Selecione|precisa|menos|indispon|vazia|não há meta|Não consegui/i.test(
              msg,
            )
              ? "destructive"
              : "default"
          }
        >
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <Section
          title="O que você quer comprar?"
          hint="Opcional: descreva em texto livre. Na próxima tela você ajusta valores e estratégias."
        >
          <div className="space-y-1.5">
            <FieldLabel
              htmlFor="nl-strategy"
              hint="Valores, parcelas, Pix vs cartão, urgência… Se preferir, deixe em branco e preencha manualmente."
            >
              Descrição (opcional)
            </FieldLabel>
            <Textarea
              id="nl-strategy"
              value={nlStrategy}
              onChange={(e) => setNlStrategy(e.target.value)}
              rows={5}
              placeholder={
                "Ex.: Quero comprar um carro de R$ 220.000. No Pix tem R$ 10.000 de desconto; no cartão posso parcelar R$ 220.000 sem juros, ou 12× (R$ 230.000) ou 13× (R$ 235.000). Tenho dinheiro rendendo e quero ver o que deixa meu patrimônio melhor: pagar à vista e repor aos poucos, ou parcelar e deixar o saldo investido."
              }
              className="min-h-28 resize-y"
            />
          </div>
          <WizardNav
            nextLabel={
              nlStrategy.trim().length >= 8
                ? "Usar texto e continuar"
                : "Pular e preencher manualmente"
            }
            onNext={() => {
              void (async () => {
                if (nlStrategy.trim().length >= 8) {
                  const ok = await translateNlStrategy();
                  if (!ok) return;
                }
                goTo(2);
              })();
            }}
          />
        </Section>
      ) : null}

      {step === 2 ? (
        <Section
          title="Valores e estratégias"
          hint="Informe à vista / a prazo e marque as estratégias que quer comparar."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="valor-vista"
                hint="Preço no Pix/débito. Base do acréscimo embutido."
              >
                Valor à vista
              </FieldLabel>
              <Input
                id="valor-vista"
                value={cashPrice}
                onChange={(e) => setCashPrice(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="valor-prazo"
                hint="Total se parcelar (soma das parcelas)."
              >
                Valor a prazo
              </FieldLabel>
              <Input
                id="valor-prazo"
                value={financedTotal}
                onChange={(e) => setFinancedTotal(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="max-parcelas" hint="Parcelas de referência (ex.: 10×).">
                Máx. parcelas
              </FieldLabel>
              <Input
                id="max-parcelas"
                value={maxInstallments}
                onChange={(e) => setMaxInstallments(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel hint="Ajuda a contextualizar se vale esperar ou comprar agora.">
                Urgência
              </FieldLabel>
              <Select
                value={urgency}
                onValueChange={(v) => {
                  if (v === "baixa" || v === "media" || v === "alta") {
                    setUrgency(v);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      v === "baixa" ? "Baixa" : v === "alta" ? "Alta" : "Média"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className="min-w-40">
                  <SelectItem value="baixa" label="Baixa">
                    Baixa
                  </SelectItem>
                  <SelectItem value="media" label="Média">
                    Média
                  </SelectItem>
                  <SelectItem value="alta" label="Alta">
                    Alta
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <p className="text-sm font-medium">Estratégias a comparar</p>
            <p className="text-xs text-muted-foreground">
              Marque as que deseja. Depois ajuste os números de cada uma.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PURCHASE_MODE_OPTIONS.map((mode) => {
                const checked = selectedModes.has(mode);
                return (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 bg-card/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) =>
                        toggleStrategyMode(mode, e.target.checked)
                      }
                    />
                    <span>
                      <span className="font-medium leading-snug">
                        {PURCHASE_MODE_LABELS[mode]}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                        {strategyHint(mode)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={fillSuggestedStrategies}
              >
                <Sparkles className="size-3.5" />
                Sugerir todas a partir dos valores
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={alternatives.length >= MAX_PURCHASE_ALTERNATIVES}
                onClick={addAlternative}
              >
                <Plus className="size-3.5" />
                Adicionar outra
              </Button>
            </div>
          </div>

          {alternatives.length > 0 ? (
            <div className="mt-6">{renderAltEditor()}</div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma estratégia selecionada ainda.
            </p>
          )}

          <WizardNav
            nextDisabled={
              parseMoneyInput(cashPrice) <= 0 || alternatives.length < 1
            }
            onNext={() => {
              if (parseMoneyInput(cashPrice) <= 0) {
                setMsg("Informe o valor à vista.");
                return;
              }
              if (alternatives.length < 1) {
                setMsg("Selecione pelo menos uma estratégia.");
                return;
              }
              goTo(3);
            }}
          />
        </Section>
      ) : null}

      {step === 3 ? (
        <Section
          title="Origem do dinheiro"
          hint="Por que pedimos isso: a simulação projeta o saldo dessa aplicação/conta ao longo de 12 meses — se você resgata à vista, se mantém investido enquanto parcela, etc."
        >
          <div className="mb-4 rounded-lg border border-border/50 bg-card/30 px-3 py-3 text-sm leading-relaxed text-muted-foreground">
            Escolha de onde sairia o Pix (ou o dinheiro que “compete” com o
            parcelamento). Com o rendimento (% CDI e IR), o app compara o
            patrimônio final de cada estratégia. Conta corrente costuma render
            0%; uma caixinha/CDB rende e muda o veredito.
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2 min-w-0">
              <FieldLabel hint="Aplicação ou conta com saldo. Ao escolher, % CDI e IR são preenchidos.">
                Origem (aplicação ou conta)
              </FieldLabel>
              {fundingSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma aplicação/conta com saldo.{" "}
                  <Link href="/aplicacoes" className="text-primary underline">
                    Aplicações
                  </Link>{" "}
                  ou{" "}
                  <Link href="/contas" className="text-primary underline">
                    Contas
                  </Link>
                  .
                </p>
              ) : (
                <Select
                  value={sourceKey || null}
                  onValueChange={(v) => {
                    if (typeof v === "string" && v) onSelectSource(v);
                  }}
                >
                  <SelectTrigger className="h-auto min-h-9 w-full max-w-full whitespace-normal py-2">
                    <SelectValue placeholder="Selecione aplicação ou conta">
                      {(value: string | null) => {
                        const src = fundingSources.find((s) => s.key === value);
                        if (!src) return "Selecione aplicação ou conta";
                        return `${src.name} · ${formatBrl(src.balance)}`;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    align="start"
                    className="min-w-[min(100vw-2rem,28rem)] max-w-[min(100vw-2rem,36rem)]"
                  >
                    {fundingSources.map((s) => (
                      <SelectItem
                        key={s.key}
                        value={s.key}
                        label={`${s.name} · ${formatBrl(s.balance)}`}
                        className="items-start whitespace-normal"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
                          <span className="font-medium leading-snug">
                            {s.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {s.group} · saldo {formatBrl(s.balance)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedSource ? (
                <p className="text-xs leading-normal text-muted-foreground">
                  Selecionada: <strong>{selectedSource.name}</strong> · saldo{" "}
                  {formatBrl(selectedSource.balance)}
                  {sourceHint ? (
                    <span className="mt-1 block">{sourceHint}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="pct-cdi" hint="Ex.: 100 = 100% do CDI.">
                % do CDI
              </FieldLabel>
              <Input
                id="pct-cdi"
                value={pctOfCdi}
                onChange={(e) => setPctOfCdi(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="cdi" hint="Premissa de mercado (editável).">
                CDI a.a. (%)
              </FieldLabel>
              <Input
                id="cdi"
                value={cdiAnnualPct}
                onChange={(e) => setCdiAnnualPct(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="ir" hint="IR estimado sobre o rendimento.">
                IR efetivo (%)
              </FieldLabel>
              <Input
                id="ir"
                value={irPct}
                onChange={(e) => setIrPct(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel
                htmlFor="savings"
                hint="Sobra mensal do orçamento (não é a parcela). Usada em consórcio/assinatura/leasing."
              >
                Poupança mensal estimada
              </FieldLabel>
              <Input
                id="savings"
                value={monthlySavings}
                onChange={(e) => setMonthlySavings(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
          <WizardNav
            nextDisabled={!sourceKey}
            onNext={() => {
              if (!sourceKey) {
                setMsg("Selecione a origem do dinheiro.");
                return;
              }
              goTo(4);
            }}
          />
        </Section>
      ) : null}

      {step === 4 ? (
        <Section
          title="Confirme e gere a análise"
          hint="Revise o resumo. Você pode voltar a qualquer passo para ajustar."
        >
          <dl className="space-y-3 text-sm">
            <div className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Intenção</dt>
              <dd className="mt-1 leading-relaxed">
                À vista {formatBrl(parseMoneyInput(cashPrice))} · a prazo{" "}
                {formatBrl(parseMoneyInput(financedTotal))} · até{" "}
                {maxInstallments}× · urgência {urgencyLabel}
              </dd>
              {nlStrategy.trim() ? (
                <dd className="mt-2 text-xs text-muted-foreground line-clamp-3">
                  “{nlStrategy.trim()}”
                </dd>
              ) : null}
            </div>
            <div className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">
                Estratégias ({alternatives.length})
              </dt>
              <dd className="mt-1 space-y-1">
                {alternatives.map((a) => (
                  <div key={a.id} className="leading-snug">
                    <strong>{altDisplayName(a)}</strong>
                    <span className="text-muted-foreground">
                      {" "}
                      · {PURCHASE_MODE_LABELS[a.mode]}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
              <dt className="text-xs text-muted-foreground">Aplicação</dt>
              <dd className="mt-1 leading-relaxed">
                {selectedSource ? (
                  <>
                    {selectedSource.name} · saldo{" "}
                    {formatBrl(selectedSource.balance)} · {pctOfCdi}% CDI · IR{" "}
                    {irPct}%
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={goBack}
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={busy}
              onClick={() => {
                const ok = runSimulation();
                if (ok) goTo(5);
              }}
            >
              <ShoppingBag className="size-4" />
              Gerar análise
            </Button>
          </div>
        </Section>
      ) : null}

      {step === 5 && result ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => goTo(4)}
            >
              <ArrowLeft className="size-4" />
              Voltar à confirmação
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => goTo(2)}
            >
              Ajustar estratégias
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => goTo(3)}
            >
              Ajustar aplicação
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(null);
                setAiText(null);
                goTo(1);
              }}
            >
              Nova simulação
            </Button>
          </div>

          {msg ? (
            <Alert
              className="mb-4"
              variant={
                /Falha|Informe|Selecione|precisa|menos|indispon|vazia|não há meta/i.test(
                  msg,
                )
                  ? "destructive"
                  : "default"
              }
            >
              <AlertDescription>
                {msg}
                {/Meta ".+" criada/i.test(msg) ? (
                  <>
                    {" "}
                    <Link
                      href="/metas"
                      className="font-medium text-primary underline"
                    >
                      Ir para Metas
                    </Link>
                  </>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Section
            title="Veredito local"
            hint="Cálculo no dispositivo com as estratégias que você confirmou."
          >
            <p className="text-base font-semibold leading-snug text-foreground">
              {result.verdictTitle}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Valores do ranking = patrimônio efetivo projetado na origem (saldo
              final − acréscimo embutido), não o preço do bem.
              {result.investmentNetAnnual < 0.0005
                ? " Conta/origem a 0% a.a.: não há ganho em “deixar rendendo” — pesa o que você paga a mais na loja."
                : null}
            </p>
            {result.liquidityAlerts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {result.liquidityAlerts.map((a) => (
                  <Alert
                    key={a.id}
                    variant={a.severity === "warning" ? "destructive" : "default"}
                  >
                    <AlertDescription>
                      <span className="font-medium text-foreground">
                        {a.title}.{" "}
                      </span>
                      {a.message}
                      {a.id === "cards:none" ? (
                        <>
                          {" "}
                          <Link
                            href="/cartoes"
                            className="font-medium text-primary underline"
                          >
                            Ir para Cartões
                          </Link>
                        </>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            ) : null}
            {result.embeddedMarkupPct != null ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Custo oculto (acréscimo embutido):{" "}
                <strong className="text-foreground">
                  {result.embeddedMarkupPct.toFixed(2).replace(".", ",")}%
                </strong>{" "}
                sobre o à vista.
              </p>
            ) : null}
            <ol className="mt-4 space-y-2">
              {result.ranking.map((r, i) => {
                const alt = result.alternatives.find((a) => a.id === r.id);
                return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/50 bg-card/30 px-3 py-2.5"
                >
                  <span className="text-sm leading-normal">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    <strong>{r.name}</strong>
                    {r.id === result.bestId ? (
                      <span className="ml-2 text-xs text-income">melhor</span>
                    ) : null}
                    {!r.feasible ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                        {alt?.mode === "cash_reverse"
                          ? "alerta: saldo"
                          : "alerta: limite"}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm">
                    <Money value={r.scoreWealth} tone="investment" />
                    {r.gapToBest > 0 ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (−{formatBrl(r.gapToBest)})
                      </span>
                    ) : null}
                  </span>
                </li>
                );
              })}
            </ol>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Rend. líquido a.a."
                valueLabel={`${(result.investmentNetAnnual * 100).toFixed(1).replace(".", ",")}%`}
              />
              {result.embeddedMarkupPct != null ? (
                <MetricCard
                  label="Taxa de acréscimo embutida"
                  valueLabel={`${result.embeddedMarkupPct.toFixed(1).replace(".", ",")}%`}
                />
              ) : null}
              {result.alternatives
                .filter((a) => a.impliedAnnualRate != null)
                .slice(0, 1)
                .map((a) => (
                  <MetricCard
                    key={a.id}
                    label={
                      a.mode === "installments_zero"
                        ? `Custo de abrir mão do Pix · ${a.name}`
                        : `Juros embutidos · ${a.name}`
                    }
                    valueLabel={`${(a.impliedAnnualRate! * 100).toFixed(1).replace(".", ",")}%`}
                  />
                ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {result.recommendedAction}
            </p>
          </Section>

          <Section
            title="Linha do tempo (saldo da aplicação)"
            hint="Colunas da melhor para a pior (mesmo ranking do veredito)."
          >
            <div className="overflow-x-auto pb-1">
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-background/95 px-3 py-3 text-left text-xs font-medium leading-normal text-muted-foreground">
                      Mês
                    </th>
                    {timelineAlts.map((a, i) => (
                      <th
                        key={a.id}
                        className="max-w-[10rem] px-3 py-3 text-left text-xs font-medium leading-normal text-muted-foreground"
                      >
                        <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground/80">
                          {i + 1}º
                        </span>
                        <span className="line-clamp-2">{a.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timelineMonths.map((m) => (
                    <tr key={m} className="border-t border-border/40">
                      <td className="sticky left-0 bg-background/95 px-3 py-2.5 tabular-nums leading-normal">
                        {m}
                      </td>
                      {timelineAlts.map((a) => {
                        const point = a.months.find((p) => p.month === m);
                        return (
                          <td
                            key={a.id}
                            className="px-3 py-2.5 leading-normal"
                          >
                            {point ? (
                              <Money
                                value={point.investmentBalance}
                                tone="investment"
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Relatório calculado"
            hint="Matemática do app — base para o assistente local."
          >
            <pre className="whitespace-pre-wrap rounded-lg border border-border/50 bg-card/40 p-4 text-sm leading-relaxed">
              {result.markdownReport}
            </pre>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {result.automation ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => void createReplenishGoal()}
                >
                  <Target className="size-4" />
                  Criar meta de reabastecimento
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Meta automática aparece com parcela reversa ou acúmulo prévio.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={busy || modelStatus.status === "disabled"}
                onClick={() => void enrichWithAI()}
              >
                <Sparkles className="size-4" />
                {busy ? "Gerando…" : "Interpretar com Analista local"}
              </Button>
              <Link
                href="/ia"
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                Gerenciador IA
              </Link>
            </div>
          </Section>

          {aiText ? (
            <Section title="Interpretação do Analista local">
              <div className="max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {aiText}
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {step === 5 && !result ? (
        <Section title="Sem resultados">
          <p className="text-sm text-muted-foreground">
            Gere a análise na etapa de confirmação.
          </p>
          <WizardNav
            nextLabel="Ir à confirmação"
            onNext={() => goTo(4)}
          />
        </Section>
      ) : null}
    </div>
  );
}


function MetricCard({
  label,
  valueLabel,
}: {
  label: string;
  valueLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
      <p className="text-xs leading-normal text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-normal tabular-nums">
        {valueLabel}
      </p>
    </div>
  );
}

