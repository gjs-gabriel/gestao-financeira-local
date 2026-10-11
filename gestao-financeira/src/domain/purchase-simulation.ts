/**
 * Motor local de simulação / recomendação de compra de alto valor.
 * Matemática no dispositivo — sem rede. Fórmulas alinhadas ao regramento do app.
 */

export const DEFAULT_CDI_ANNUAL = 0.1415;
export const DEFAULT_IR_RATE = 0.175;
export const MAX_PURCHASE_ALTERNATIVES = 8;

/** Estratégias mapeadas no ecossistema. */
export type PurchaseAltMode =
  | "cash_reverse"
  | "installments_zero"
  | "installments_markup"
  | "save_then_buy"
  | "consortium"
  | "financing_interest"
  | "subscription"
  | "leasing";

/** @deprecated aliases antigos — normalizados em normalizeMode */
export type LegacyPurchaseAltMode =
  | "cash_replenish"
  | "cash_no_replenish"
  | "installments"
  | "down_payment";

export const PURCHASE_MODE_LABELS: Record<PurchaseAltMode, string> = {
  cash_reverse: "À vista com desconto (parcela reversa)",
  installments_zero: "Parcelado sem juros (arbitragem)",
  installments_markup: "Parcelamento com acréscimo",
  save_then_buy: "Acúmulo prévio (poupar via metas)",
  consortium: "Consórcio (compra programada)",
  financing_interest: "Financiamento (com taxa)",
  subscription: "Assinatura / locação",
  leasing: "Leasing (arrendamento)",
};

export const PURCHASE_MODE_OPTIONS: PurchaseAltMode[] = [
  "cash_reverse",
  "installments_zero",
  "installments_markup",
  "save_then_buy",
  "consortium",
  "financing_interest",
  "subscription",
  "leasing",
];

export type PurchaseUrgency = "baixa" | "media" | "alta";

/** Alternativa de compra definida pelo usuário ou gerada pelo motor. */
export type PurchaseAlternativeInput = {
  id: string;
  name: string;
  mode: PurchaseAltMode | LegacyPurchaseAltMode;
  /**
   * cash_reverse: VALOR_A_VISTA
   * installments_zero / installments_markup: VALOR_A_PRAZO (total)
   * financing_interest: principal financiado (em geral = à vista)
   * save_then_buy: preço-alvo
   * consortium: valor da carta / bem
   * subscription / leasing: mensalidade (= monthlyOutflow)
   */
  amount: number;
  /** Parcelas / meses do plano. */
  installments: number;
  /**
   * Aporte (cash_reverse), guarda (save_then_buy) ou mensalidade (consórcio / assinatura / leasing).
   * Parcelado: omitir — usa amount / installments.
   */
  monthlyOutflow?: number;
  /** Residual / opção de compra no leasing (mês final). */
  residualAmount?: number;
  /**
   * Taxa de juros a.m. em % (financiamento). Ex.: 1.79 = 1,79% a.m.
   * Se omitida, usa amount como total a prazo (compat).
   */
  monthlyRatePct?: number;
};

export type PurchaseCardLiquidity = {
  id: string;
  name: string;
  /** Limite disponível (não usado). */
  available: number;
  limit: number;
};

export type PurchaseLiquidityAlert = {
  id: string;
  severity: "info" | "warning";
  /** Alternativa relacionada, se houver. */
  strategyId?: string;
  strategyName?: string;
  title: string;
  message: string;
};

export type PurchaseContextInput = {
  investmentName: string;
  investmentBalance: number;
  /** % do CDI (ex.: 120). */
  pctOfCdi: number;
  cdiAnnual: number;
  irRate: number;
  monthlySavings: number;
  horizonMonths?: number;
  /** VALOR_A_VISTA de referência (juros embutidos / cenários). */
  referenceCashPrice?: number;
  /** VALOR_A_PRAZO de referência. */
  referenceFinancedTotal?: number;
  maxInterestFreeInstallments?: number;
  urgency?: PurchaseUrgency;
  /** Cartões do cofre — só para alertas de limite (não altera ranking). */
  cards?: PurchaseCardLiquidity[];
};

export type PurchaseMonthPoint = {
  month: number;
  investmentBalance: number;
  netWorthDelta: number;
};

export type PurchaseAlternativeResult = {
  id: string;
  name: string;
  mode: PurchaseAltMode;
  amount: number;
  installments: number;
  monthlyOutflow: number;
  /** Residual / opção de compra (leasing). */
  residualAmount: number;
  /** Taxa a.m. em % usada no financiamento (se houver). */
  monthlyRatePct: number | null;
  months: PurchaseMonthPoint[];
  finalInvestment: number;
  /** Patrimônio efetivo para ranking (invest. − custo de juros / residual). */
  scoreWealth: number;
  finalNetWorthDelta: number;
  impliedMonthlyRate: number | null;
  impliedAnnualRate: number | null;
  ownsAsset: boolean;
  /** false se o saldo da origem não cobre o desembolso (ex.: Pix com CC vazia). */
  feasible: boolean;
  infeasibleReason?: string;
};

export type PurchaseSimulationResult = {
  verdict: "ranked" | "insufficient" | "neutral";
  verdictTitle: string;
  bestId: string | null;
  ranking: {
    id: string;
    name: string;
    finalInvestment: number;
    scoreWealth: number;
    gapToBest: number;
    /** false = na prática falta saldo/crédito; ranking permanece hipotético. */
    feasible: boolean;
  }[];
  alternatives: PurchaseAlternativeResult[];
  /** Alertas de liquidez (saldo/limite) — não alteram o ranking. */
  liquidityAlerts: PurchaseLiquidityAlert[];
  investmentGrossAnnual: number;
  investmentNetAnnual: number;
  investmentNetMonthly: number;
  referenceCashPrice: number;
  /** Taxa de acréscimo embutida em % (ex.: 12.5 = 12,5%). */
  embeddedMarkupPct: number | null;
  automation: {
    goalName: string;
    monthlyAmount: number;
    targetAmount: number;
    months: number;
  } | null;
  facts: Record<string, unknown>;
  markdownReport: string;
  recommendedAction: string;
};

function brlHint(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Alertas de saldo/limite — informativos; ranking continua hipotético. */
export function buildPurchaseLiquidityAlerts(args: {
  sourceName: string;
  sourceBalance: number;
  cards: PurchaseCardLiquidity[];
  alternatives: PurchaseAlternativeResult[];
}): PurchaseLiquidityAlert[] {
  const alerts: PurchaseLiquidityAlert[] = [];
  const { sourceName, sourceBalance, cards, alternatives } = args;

  const cashGaps = alternatives.filter(
    (a) => a.mode === "cash_reverse" && a.amount > sourceBalance + 0.009,
  );
  const cardModes = alternatives.filter(
    (a) =>
      a.mode === "installments_zero" ||
      a.mode === "installments_markup" ||
      a.mode === "financing_interest",
  );
  const cardGaps = cardModes.filter((a) => {
    if (cards.length === 0) return false;
    return !cards.some((c) => c.available + 0.009 >= a.amount);
  });
  const hasPracticalGap =
    cashGaps.length > 0 ||
    cardGaps.length > 0 ||
    (cardModes.length > 0 && cards.length === 0);

  if (hasPracticalGap) {
    alerts.push({
      id: "hypothetical",
      severity: "info",
      title: "Ranking hipotético",
      message:
        "O ranking assume que o saldo e o crédito necessários existem. Use os alertas abaixo para ver o que falta na prática — isso não muda a ordem das estratégias.",
    });
  }

  for (const a of cashGaps) {
    const shortfall = round2(a.amount - sourceBalance);
    alerts.push({
      id: `cash:${a.id}`,
      severity: "warning",
      strategyId: a.id,
      strategyName: a.name,
      title: `Saldo insuficiente para “${a.name}”`,
      message: `${sourceName} tem ${brlHint(sourceBalance)}; a compra à vista pede ${brlHint(a.amount)} (faltam ${brlHint(shortfall)}). Oriente-se: juntar o valor, usar outra origem com saldo, ou preferir parcelamento/financiamento se houver crédito.`,
    });
  }

  if (cardModes.length > 0 && cards.length === 0) {
    alerts.push({
      id: "cards:none",
      severity: "info",
      title: "Limite de cartão não verificado",
      message:
        "Não há cartão cadastrado no cofre. Cadastre em Cartões para o app avisar se o limite disponível cobre o total a prazo.",
    });
  } else {
    for (const a of cardGaps) {
      const best = [...cards].sort((x, y) => y.available - x.available)[0];
      const bestHint = best
        ? `Maior limite livre hoje: ${best.name} (${brlHint(best.available)} de ${brlHint(best.limit)}).`
        : "";
      alerts.push({
        id: `card:${a.id}`,
        severity: "warning",
        strategyId: a.id,
        strategyName: a.name,
        title: `Crédito insuficiente para “${a.name}”`,
        message: `Nenhum cartão tem limite disponível ≥ ${brlHint(a.amount)}. ${bestHint} O ranking ainda compara a estratégia como se o crédito existisse.`,
      });
    }
  }

  return alerts;
}

/** @deprecated compat testes legados */
export type PurchaseSimulationInput = {
  cashPrice: number;
  financedTotal: number;
  installments: number;
  investmentName: string;
  investmentBalance: number;
  pctOfCdi: number;
  cdiAnnual: number;
  irRate: number;
  monthlySavings: number;
  horizonMonths?: number;
  cashLabel?: string;
  financedLabel?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function annualToMonthly(annual: number): number {
  if (annual <= -1) return 0;
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** Taxa de acréscimo embutida em %: ((prazo - vista) / vista) * 100 */
export function embeddedMarkupPercent(
  cashPrice: number,
  financedTotal: number,
): number | null {
  if (cashPrice <= 0) return null;
  return round2(((financedTotal - cashPrice) / cashPrice) * 100);
}

export function solveImpliedMonthlyRate(
  presentValue: number,
  payment: number,
  n: number,
): number | null {
  if (presentValue <= 0 || payment <= 0 || n < 1) return null;
  if (payment * n <= presentValue) return 0;

  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    const factor = mid === 0 ? n : (1 - Math.pow(1 + mid, -n)) / mid;
    const pv = payment * factor;
    if (pv > presentValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Parcela Price: principal + taxa a.m. (fração) + N. */
export function pricePayment(
  principal: number,
  monthlyRate: number,
  n: number,
): number {
  if (principal <= 0 || n < 1) return 0;
  if (monthlyRate <= 0) return round2(principal / n);
  const pow = Math.pow(1 + monthlyRate, n);
  return round2((principal * monthlyRate * pow) / (pow - 1));
}

export function parsePctOfCdi(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.match(/(\d{2,3}(?:[.,]\d+)?)\s*%\s*(?:do\s*)?cdi/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type FundingSourceKind = "investment" | "account";

export type FundingSourceYieldInput = {
  kind: FundingSourceKind;
  name: string;
  notes?: string | null;
  rawName?: string | null;
  /** classification da aplicação; contas usam type (checking, savings…). */
  classificationOrType?: string | null;
};

export type FundingSourceYieldAssumptions = {
  pctOfCdi: number;
  /** CDI a.a. em fração (ex.: 0.1415). */
  cdiAnnual: number;
  /** IR efetivo em fração (ex.: 0.175). */
  irRate: number;
  hint: string;
};

/**
 * Premissas de rendimento ao selecionar aplicação ou conta corrente.
 * Lê % CDI do nome/notas quando houver; senão usa default por classe.
 */
export function inferSourceYieldAssumptions(
  source: FundingSourceYieldInput,
  opts?: { cdiAnnual?: number },
): FundingSourceYieldAssumptions {
  const cdiAnnual = opts?.cdiAnnual ?? DEFAULT_CDI_ANNUAL;
  const blob = [source.name, source.rawName, source.notes]
    .filter(Boolean)
    .join(" ");
  const parsed = parsePctOfCdi(blob);
  const kind = (source.classificationOrType || "").toLowerCase();

  if (source.kind === "account") {
    if (kind === "savings" || /poupan/.test(blob)) {
      return {
        pctOfCdi: parsed ?? 70,
        cdiAnnual,
        irRate: 0,
        hint: "Conta poupança — rendimento ~70% CDI, isenta de IR (PF).",
      };
    }
    return {
      pctOfCdi: parsed ?? 0,
      cdiAnnual,
      irRate: 0,
      hint: "Conta corrente / caixa — premissa de rendimento zero (editável).",
    };
  }

  switch (kind) {
    case "poupanca":
      return {
        pctOfCdi: parsed ?? 70,
        cdiAnnual,
        irRate: 0,
        hint: "Poupança — ~70% CDI, IR 0% (PF).",
      };
    case "renda_fixa":
      return {
        pctOfCdi: parsed ?? (/selic|tesouro/i.test(blob) ? 100 : 110),
        cdiAnnual,
        irRate: DEFAULT_IR_RATE,
        hint: "Renda fixa — % CDI do nome/notas ou padrão; IR 17,5% (1 ano).",
      };
    case "previdencia":
      return {
        pctOfCdi: parsed ?? 100,
        cdiAnnual,
        irRate: 0.15,
        hint: "Previdência — premissa 100% CDI; IR efetivo 15%.",
      };
    case "fiis":
      return {
        pctOfCdi: parsed ?? 100,
        cdiAnnual,
        irRate: 0,
        hint: "FIIs — retorno proxy em % CDI; IR 0% em proventos (PF).",
      };
    case "acoes":
    case "etfs":
      return {
        pctOfCdi: parsed ?? 140,
        cdiAnnual,
        irRate: 0.15,
        hint: "Renda variável — proxy de retorno ~140% CDI; IR 15%.",
      };
    case "cripto":
      return {
        pctOfCdi: parsed ?? 120,
        cdiAnnual,
        irRate: 0.15,
        hint: "Cripto — proxy conservador; IR 15%.",
      };
    default:
      return {
        pctOfCdi: parsed ?? 100,
        cdiAnnual,
        irRate: DEFAULT_IR_RATE,
        hint: "Premissa padrão 100% CDI e IR 17,5% (editável).",
      };
  }
}

function formatPctBr(fractionOrPct: number, asPercentPoints: boolean): string {
  const n = asPercentPoints ? fractionOrPct : fractionOrPct * 100;
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

/** Formata premissas para inputs da UI (vírgula BR). */
export function formatYieldAssumptionsForInputs(
  a: FundingSourceYieldAssumptions,
): { pctOfCdi: string; cdiAnnualPct: string; irPct: string } {
  return {
    pctOfCdi: String(Math.round(a.pctOfCdi * 100) / 100).replace(".", ","),
    cdiAnnualPct: formatPctBr(a.cdiAnnual, false),
    irPct: formatPctBr(a.irRate, false),
  };
}

export function normalizeMode(
  mode: PurchaseAltMode | LegacyPurchaseAltMode,
): PurchaseAltMode {
  switch (mode) {
    case "cash_replenish":
    case "cash_no_replenish":
      return "cash_reverse";
    case "installments":
      return "installments_zero";
    case "down_payment":
      return "installments_markup";
    default:
      return mode;
  }
}

function pushMonth(
  months: PurchaseMonthPoint[],
  month: number,
  inv: number,
  startInv: number,
) {
  months.push({
    month,
    investmentBalance: round2(inv),
    netWorthDelta: round2(inv - startInv),
  });
}

/**
 * Cenário A — À vista + parcela reversa:
 * M0 = Saldo - vista; cada mês: M = (M + aporte) * (1 + i),
 * aporte = VALOR_A_PRAZO / N durante N meses.
 */
function projectCashReverse(
  startInv: number,
  cashPrice: number,
  monthlyReplenish: number,
  replenishMonths: number,
  r: number,
  horizon: number,
): PurchaseMonthPoint[] {
  const months: PurchaseMonthPoint[] = [];
  let inv = startInv - cashPrice;
  pushMonth(months, 0, inv, startInv);
  for (let m = 1; m <= horizon; m++) {
    const aporte = m <= replenishMonths ? monthlyReplenish : 0;
    inv = (inv + aporte) * (1 + r);
    pushMonth(months, m, inv, startInv);
  }
  return months;
}

/**
 * Cenário B — saldo permanece investido; sem novos aportes
 * (fluxo vai para cartão/parcela). Em 12m: Saldo * (1 + taxa líquida a.a.).
 */
function projectBalanceOnlyCompound(
  startInv: number,
  r: number,
  horizon: number,
): PurchaseMonthPoint[] {
  const months: PurchaseMonthPoint[] = [];
  let inv = startInv;
  pushMonth(months, 0, inv, startInv);
  for (let m = 1; m <= horizon; m++) {
    inv = inv * (1 + r);
    pushMonth(months, m, inv, startInv);
  }
  return months;
}

function projectSaveThenBuy(
  startInv: number,
  target: number,
  monthlySave: number,
  saveMonths: number,
  savings: number,
  r: number,
  horizon: number,
): PurchaseMonthPoint[] {
  const months: PurchaseMonthPoint[] = [];
  let inv = startInv;
  let piggy = 0;
  pushMonth(months, 0, inv, startInv);
  for (let m = 1; m <= horizon; m++) {
    if (m <= saveMonths) {
      const save = Math.min(monthlySave, savings);
      piggy += save;
      const contrib = Math.max(0, savings - save);
      inv = (inv + contrib) * (1 + r);
      if (m === saveMonths) {
        inv -= Math.max(0, target - piggy);
        piggy = 0;
      }
    } else {
      inv = (inv + savings) * (1 + r);
    }
    pushMonth(months, m, inv, startInv);
  }
  return months;
}

/** Consórcio: mensalidade sai do fluxo; patrimônio rende; bem ao final do plano. */
function projectConsortium(
  startInv: number,
  monthlyFee: number,
  planMonths: number,
  savings: number,
  r: number,
  horizon: number,
): PurchaseMonthPoint[] {
  const months: PurchaseMonthPoint[] = [];
  let inv = startInv;
  pushMonth(months, 0, inv, startInv);
  for (let m = 1; m <= horizon; m++) {
    const fee = m <= planMonths ? monthlyFee : 0;
    const contrib = Math.max(0, savings - fee);
    inv = (inv + contrib) * (1 + r);
    pushMonth(months, m, inv, startInv);
  }
  return months;
}

/** Assinatura/locação: mensalidade permanente no horizonte; sem propriedade. */
function projectSubscription(
  startInv: number,
  monthlyRent: number,
  savings: number,
  r: number,
  horizon: number,
): PurchaseMonthPoint[] {
  const months: PurchaseMonthPoint[] = [];
  let inv = startInv;
  pushMonth(months, 0, inv, startInv);
  for (let m = 1; m <= horizon; m++) {
    const contrib = Math.max(0, savings - monthlyRent);
    inv = (inv + contrib) * (1 + r);
    pushMonth(months, m, inv, startInv);
  }
  return months;
}

/** Leasing: mensalidade + residual opcional no último mês do plano. */
function projectLeasing(
  startInv: number,
  monthlyLease: number,
  planMonths: number,
  residual: number,
  savings: number,
  r: number,
  horizon: number,
): PurchaseMonthPoint[] {
  const months: PurchaseMonthPoint[] = [];
  let inv = startInv;
  pushMonth(months, 0, inv, startInv);
  for (let m = 1; m <= horizon; m++) {
    const fee = m <= planMonths ? monthlyLease : 0;
    const contrib = Math.max(0, savings - fee);
    inv = (inv + contrib) * (1 + r);
    if (m === planMonths && residual > 0) {
      inv -= residual;
    }
    pushMonth(months, m, inv, startInv);
  }
  return months;
}

function projectAlternative(
  alt: PurchaseAlternativeInput,
  startInv: number,
  r: number,
  savings: number,
  horizon: number,
  referenceCash: number,
  referenceFinanced: number,
): PurchaseAlternativeResult {
  const mode = normalizeMode(alt.mode);
  const n = Math.max(1, Math.floor(alt.installments));
  const amount = Math.max(0, alt.amount);
  // null/undefined = auto (amount/N). 0 explícito = zero (não recalcular).
  const monthlyOutflow =
    alt.monthlyOutflow != null
      ? round2(Math.max(0, alt.monthlyOutflow))
      : round2(amount / n);
  const residual = Math.max(0, alt.residualAmount ?? 0);

  let months: PurchaseMonthPoint[];
  let ownsAsset = true;
  let interestPenalty = 0;
  let effectiveMonthly = monthlyOutflow;
  let resultAmount = amount;
  let resultRatePct: number | null = null;
  let feasible = true;
  let infeasibleReason: string | undefined;

  switch (mode) {
    case "cash_reverse": {
      if (amount > startInv + 0.009) {
        feasible = false;
        infeasibleReason =
          "Saldo da origem insuficiente para pagar à vista (a simulação não inventa empréstimo a juro zero).";
      }
      // Aporte explícito (inclui 0) prevalece; vazio → VALOR_A_PRAZO/N ou amount/N
      const autoReplenish =
        referenceFinanced > 0
          ? round2(referenceFinanced / n)
          : round2(amount / n);
      let replenish =
        alt.monthlyOutflow != null
          ? round2(Math.max(0, alt.monthlyOutflow))
          : autoReplenish;
      // Proteção: se veio o total a prazo no lugar da parcela (ex.: 9999 vs 999,90), corrige
      if (
        replenish > 0 &&
        amount > 0 &&
        replenish >= amount * 0.5 &&
        autoReplenish > 0 &&
        autoReplenish < replenish * 0.5
      ) {
        replenish = autoReplenish;
      }
      effectiveMonthly = replenish;
      months = projectCashReverse(startInv, amount, replenish, n, r, horizon);
      break;
    }
    case "installments_zero": {
      months = projectBalanceOnlyCompound(startInv, r, horizon);
      break;
    }
    case "installments_markup": {
      // Loja/cartão: total a prazo informado; penaliza vs à vista
      months = projectBalanceOnlyCompound(startInv, r, horizon);
      const cash = referenceCash > 0 ? referenceCash : amount;
      const financed = Math.max(amount, referenceFinanced);
      resultAmount = financed;
      interestPenalty = Math.max(0, financed - cash);
      effectiveMonthly =
        alt.monthlyOutflow != null && alt.monthlyOutflow > 0
          ? monthlyOutflow
          : round2(financed / n);
      break;
    }
    case "financing_interest": {
      // Banco: taxa a.m. → parcela Price; sem taxa, amount = total a prazo (compat)
      months = projectBalanceOnlyCompound(startInv, r, horizon);
      const cash = referenceCash > 0 ? referenceCash : 0;
      const ratePct =
        alt.monthlyRatePct != null && alt.monthlyRatePct > 0
          ? alt.monthlyRatePct
          : null;
      if (ratePct != null) {
        const pv = amount > 0 ? amount : cash;
        const pmt = pricePayment(pv, ratePct / 100, n);
        const total = round2(pmt * n);
        resultAmount = total;
        effectiveMonthly = pmt;
        interestPenalty = Math.max(0, total - (cash > 0 ? cash : pv));
        resultRatePct = ratePct;
      } else {
        const financed = Math.max(amount, referenceFinanced);
        resultAmount = financed;
        effectiveMonthly =
          alt.monthlyOutflow != null && alt.monthlyOutflow > 0
            ? monthlyOutflow
            : round2(financed / n);
        interestPenalty = Math.max(
          0,
          financed - (cash > 0 ? cash : amount),
        );
      }
      break;
    }
    case "save_then_buy": {
      months = projectSaveThenBuy(
        startInv,
        amount,
        monthlyOutflow,
        n,
        savings,
        r,
        horizon,
      );
      break;
    }
    case "consortium": {
      months = projectConsortium(
        startInv,
        monthlyOutflow,
        n,
        savings,
        r,
        horizon,
      );
      break;
    }
    case "subscription": {
      months = projectSubscription(
        startInv,
        monthlyOutflow > 0 ? monthlyOutflow : amount,
        savings,
        r,
        horizon,
      );
      ownsAsset = false;
      break;
    }
    case "leasing": {
      months = projectLeasing(
        startInv,
        monthlyOutflow,
        n,
        residual,
        savings,
        r,
        horizon,
      );
      ownsAsset = residual > 0;
      break;
    }
  }

  let impliedMonthly: number | null = null;
  if (
    (mode === "installments_zero" ||
      mode === "installments_markup" ||
      mode === "financing_interest") &&
    referenceCash > 0
  ) {
    impliedMonthly = solveImpliedMonthlyRate(
      referenceCash,
      effectiveMonthly,
      n,
    );
  } else if (mode === "leasing" && referenceCash > 0) {
    impliedMonthly = solveImpliedMonthlyRate(
      referenceCash,
      effectiveMonthly,
      n,
    );
  }
  const impliedAnnual =
    impliedMonthly == null ? null : Math.pow(1 + impliedMonthly, 12) - 1;

  const last = months[months.length - 1]!;
  const finalInvestment = last.investmentBalance;
  // Assinatura: penaliza levemente no score (sem ativo). Financiamento: desconta juros.
  const ownershipHaircut = ownsAsset ? 0 : finalInvestment * 0.02;
  const scoreWealth = round2(
    finalInvestment - interestPenalty - ownershipHaircut,
  );

  const outAmount =
    mode === "installments_markup" || mode === "financing_interest"
      ? resultAmount
      : (mode === "subscription" || mode === "leasing") && amount <= 0
        ? effectiveMonthly
        : amount;

  return {
    id: alt.id,
    name: alt.name.trim() || PURCHASE_MODE_LABELS[mode],
    mode,
    amount: outAmount,
    installments: n,
    monthlyOutflow:
      (mode === "subscription" || mode === "leasing") && effectiveMonthly <= 0
        ? amount
        : effectiveMonthly,
    residualAmount: mode === "leasing" ? residual : 0,
    monthlyRatePct: resultRatePct,
    months,
    finalInvestment,
    scoreWealth,
    finalNetWorthDelta: last.netWorthDelta,
    impliedMonthlyRate: impliedMonthly,
    impliedAnnualRate: impliedAnnual,
    ownsAsset,
    feasible,
    infeasibleReason,
  };
}

function recommendedNativeAction(
  best: PurchaseAlternativeResult | undefined,
  automation: PurchaseSimulationResult["automation"],
): string {
  if (!best) {
    return "Revise os valores à vista/a prazo e rode a simulação de novo.";
  }
  switch (best.mode) {
    case "cash_reverse":
      return automation
        ? `No app: registre a compra à vista e crie a Meta “${automation.goalName}” (${formatHint(automation.monthlyAmount)}/mês).`
        : "No app: registre a saída à vista na aplicação e uma recorrência de reaporte.";
    case "installments_zero":
      return "No app: lance as parcelas no cartão/crediário e mantenha a aplicação rendendo (sem resgate).";
    case "installments_markup":
      return "No app: registre o parcelamento (total a prazo) e compare com o Pix — o acréscimo embutido está no alerta de custo oculto.";
    case "save_then_buy":
      return automation
        ? `No app: crie a Meta “${automation.goalName}” e acompanhe o acúmulo antes de comprar.`
        : "No app: crie uma Meta com o preço-alvo e aporte mensal.";
    case "consortium":
      return "No app: cadastre a mensalidade do consórcio como despesa recorrente e a Meta do bem contemplado.";
    case "financing_interest":
      return "No app: registre o financiamento (principal, taxa e parcelas) e compare o custo total com o à vista.";
    case "subscription":
      return "No app: cadastre a assinatura/locação em Assinaturas e evite Meta de aquisição (uso sem propriedade).";
    case "leasing":
      return "No app: registre as parcelas do leasing; se houver opção de compra, planeje o residual como Meta no fim do contrato.";
  }
}

function formatHint(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function simulatePurchaseAlternatives(
  context: PurchaseContextInput,
  alternatives: PurchaseAlternativeInput[],
): PurchaseSimulationResult {
  const horizon = Math.max(1, context.horizonMonths ?? 12);
  const pct = Math.max(0, context.pctOfCdi);
  const cdi = Math.max(0, context.cdiAnnual);
  const ir = Math.min(0.275, Math.max(0, context.irRate));
  const savings = Math.max(0, context.monthlySavings);
  const startInv = Math.max(0, context.investmentBalance);

  // Rendimento bruto da aplicação = CDI * (% do CDI)
  const grossAnnual = cdi * (pct / 100);
  // Taxa_Liquida_Anual = bruto * (1 - IR)
  const netAnnual = grossAnnual * (1 - ir);
  const r = annualToMonthly(netAnnual);

  const cleaned = alternatives
    .filter((a) => {
      const mode = normalizeMode(a.mode);
      if (a.installments < 1) return false;
      if (mode === "subscription" || mode === "leasing") {
        const fee =
          a.monthlyOutflow != null && a.monthlyOutflow > 0
            ? a.monthlyOutflow
            : a.amount;
        return fee > 0;
      }
      if (mode === "consortium") {
        const fee =
          a.monthlyOutflow != null && a.monthlyOutflow > 0
            ? a.monthlyOutflow
            : 0;
        return a.amount > 0 && fee > 0;
      }
      return a.amount > 0;
    })
    .slice(0, MAX_PURCHASE_ALTERNATIVES)
    .map((a) => {
      const mode = normalizeMode(a.mode);
      if (mode === "subscription" || mode === "leasing") {
        const fee =
          a.monthlyOutflow != null && a.monthlyOutflow > 0
            ? a.monthlyOutflow
            : a.amount;
        return { ...a, mode, amount: fee, monthlyOutflow: fee };
      }
      return { ...a, mode };
    });

  const cashAlts = cleaned.filter((a) => a.mode === "cash_reverse");
  const referenceCash =
    context.referenceCashPrice && context.referenceCashPrice > 0
      ? context.referenceCashPrice
      : cashAlts[0]?.amount ??
        cleaned.find((a) => a.mode === "save_then_buy")?.amount ??
        0;

  const financedAlt = cleaned.find(
    (a) =>
      a.mode === "installments_zero" ||
      a.mode === "installments_markup" ||
      a.mode === "financing_interest",
  );
  const referenceFinanced =
    context.referenceFinancedTotal && context.referenceFinancedTotal > 0
      ? context.referenceFinancedTotal
      : financedAlt?.amount ?? 0;

  const markupPct =
    referenceCash > 0 && referenceFinanced > 0
      ? embeddedMarkupPercent(referenceCash, referenceFinanced)
      : null;

  const maxN = cleaned.reduce((m, a) => Math.max(m, a.installments), 1);
  const projHorizon = Math.max(horizon, maxN);

  const cards = context.cards ?? [];
  const results = cleaned.map((alt) => {
    const projected = projectAlternative(
      alt,
      startInv,
      r,
      savings,
      projHorizon,
      referenceCash,
      referenceFinanced,
    );
    const isCard =
      projected.mode === "installments_zero" ||
      projected.mode === "installments_markup" ||
      projected.mode === "financing_interest";
    if (isCard && cards.length > 0) {
      const covered = cards.some(
        (c) => c.available + 0.009 >= projected.amount,
      );
      if (!covered) {
        return {
          ...projected,
          feasible: false,
          infeasibleReason:
            "Nenhum cartão tem limite disponível para o total desta estratégia.",
        };
      }
    }
    return projected;
  });

  const liquidityAlerts = buildPurchaseLiquidityAlerts({
    sourceName: context.investmentName || "Origem",
    sourceBalance: startInv,
    cards,
    alternatives: results,
  });

  const practicalGaps = liquidityAlerts.some((a) => a.severity === "warning");

  // Ranking sempre hipotético (saldo/crédito não reordenam)
  const ranking = [...results]
    .sort((a, b) => b.scoreWealth - a.scoreWealth)
    .map((a, _, arr) => ({
      id: a.id,
      name: a.name,
      finalInvestment: a.finalInvestment,
      scoreWealth: a.scoreWealth,
      gapToBest: round2(arr[0]!.scoreWealth - a.scoreWealth),
      feasible: a.feasible,
    }));

  const best = ranking[0] ?? null;
  const bestAlt = results.find((a) => a.id === best?.id);
  const spread =
    ranking.length >= 2
      ? round2(
          ranking[0]!.scoreWealth - ranking[ranking.length - 1]!.scoreWealth,
        )
      : 0;

  let verdict: PurchaseSimulationResult["verdict"];
  let verdictTitle: string;
  if (results.length === 0) {
    verdict = "neutral";
    verdictTitle = "Informe ao menos uma estratégia de compra válida.";
  } else if (
    ranking.length >= 2 &&
    Math.abs(spread) < 1 &&
    ranking.every((r) => Math.abs(r.gapToBest) < 1)
  ) {
    verdict = practicalGaps ? "insufficient" : "neutral";
    verdictTitle =
      "Empate técnico local — impacto patrimonial quase equivalente no horizonte";
  } else if (best && ranking.length === 1) {
    verdict = practicalGaps ? "insufficient" : "ranked";
    verdictTitle = `Cenário “${best.name}” — impacto projetado no saldo da origem`;
  } else if (best) {
    verdict = practicalGaps ? "insufficient" : "ranked";
    const zeroYield = netAnnual < 0.0005;
    verdictTitle = zeroYield
      ? `Melhor estratégia (hipotética): “${best.name}” — origem sem rendimento; veja alertas de saldo/limite`
      : `Melhor estratégia (hipotética): “${best.name}” — maior patrimônio efetivo ao final`;
  } else {
    verdict = "neutral";
    verdictTitle = "Simulação concluída";
  }

  const replenish = results.find((a) => a.mode === "cash_reverse");
  const saveGoal = results.find((a) => a.mode === "save_then_buy");
  const automation = replenish
    ? {
        goalName: `Reabastecer ${context.investmentName || "aplicação"}`,
        monthlyAmount: replenish.monthlyOutflow,
        targetAmount: round2(replenish.amount),
        months: replenish.installments,
      }
    : saveGoal
      ? {
          goalName: `Acúmulo prévio — ${saveGoal.name}`,
          monthlyAmount: saveGoal.monthlyOutflow,
          targetAmount: round2(saveGoal.amount),
          months: saveGoal.installments,
        }
      : null;

  const recommendedAction = recommendedNativeAction(bestAlt, automation);

  const facts = {
    VALOR_A_VISTA: referenceCash,
    VALOR_A_PRAZO: referenceFinanced,
    MAX_PARCELAS_SEM_JUROS:
      context.maxInterestFreeInstallments ??
      cleaned.find((a) => a.mode === "installments_zero")?.installments ??
      null,
    URGENCIA: context.urgency ?? "media",
    APLICACAO_LOCAL: {
      nome: context.investmentName,
      saldo: startInv,
      rendimento_bruto_aa: round2(grossAnnual * 100),
      rendimento_liquido_aa: round2(netAnnual * 100),
      pct_cdi: pct,
    },
    TAXA_ACRESCIMO_PCT: markupPct,
    POUPANCA_MENSAL: savings,
    ALTERNATIVAS: results.map((a) => ({
      id: a.id,
      nome: a.name,
      estrategia: a.mode,
      label: PURCHASE_MODE_LABELS[a.mode],
      valor: a.amount,
      parcelas: a.installments,
      saida_mensal: a.monthlyOutflow,
      taxa_am_pct: a.monthlyRatePct,
      saldo_final: a.finalInvestment,
      score: a.scoreWealth,
      liquidez_ok: a.feasible,
      possui_bem: a.ownsAsset,
      juros_embutidos_aa:
        a.impliedAnnualRate == null
          ? null
          : round2(a.impliedAnnualRate * 100),
    })),
    ALERTAS_LIQUIDEZ: liquidityAlerts.map((a) => ({
      id: a.id,
      severidade: a.severity,
      titulo: a.title,
      mensagem: a.message,
      estrategia: a.strategyName ?? null,
    })),
    RANKING: ranking.map((r) => r.name),
    MELHOR: best?.name ?? null,
    VEREDITO: verdict,
    ACAO_NATIVA: recommendedAction,
  };

  const markdownReport = buildMarkdownReport({
    verdictTitle,
    context,
    results,
    ranking,
    best,
    netAnnual,
    grossAnnual,
    referenceCash,
    referenceFinanced,
    markupPct,
    automation,
    ir,
    recommendedAction,
  });

  return {
    verdict,
    verdictTitle,
    bestId: best?.id ?? null,
    ranking,
    alternatives: results,
    liquidityAlerts,
    investmentGrossAnnual: grossAnnual,
    investmentNetAnnual: netAnnual,
    investmentNetMonthly: r,
    referenceCashPrice: referenceCash,
    embeddedMarkupPct: markupPct,
    automation,
    facts,
    markdownReport,
    recommendedAction,
  };
}

/**
 * Gera as estratégias a partir do payload de intenção de compra
 * e retorna a simulação completa (recomendação estratégica).
 */
export function recommendPurchaseStrategies(
  context: PurchaseContextInput & {
    cashPrice: number;
    financedTotal: number;
    maxInstallments: number;
  },
): PurchaseSimulationResult {
  const vista = Math.max(0, context.cashPrice);
  const prazo = Math.max(0, context.financedTotal);
  const n = Math.max(1, Math.floor(context.maxInstallments));
  const parcela = prazo > 0 ? round2(prazo / n) : round2(vista / n);
  const markup = vista > 0 ? embeddedMarkupPercent(vista, prazo) : null;
  const zeroInterest = markup != null && Math.abs(markup) < 0.5;
  const markupTotal =
    !zeroInterest && prazo > vista ? prazo : round2(vista * 1.12);
  const markupN = !zeroInterest && prazo > vista ? n : Math.max(n, 12);

  const alts: PurchaseAlternativeInput[] = [
    {
      id: "strat_cash_reverse",
      name: PURCHASE_MODE_LABELS.cash_reverse,
      mode: "cash_reverse",
      amount: vista,
      installments: n,
      monthlyOutflow: parcela,
    },
    {
      id: "strat_inst_zero",
      name: PURCHASE_MODE_LABELS.installments_zero,
      mode: "installments_zero",
      amount: zeroInterest ? prazo || vista : vista,
      installments: n,
      monthlyOutflow: zeroInterest ? parcela : round2(vista / n),
    },
    {
      id: "strat_inst_markup",
      name: PURCHASE_MODE_LABELS.installments_markup,
      mode: "installments_markup",
      amount: markupTotal,
      installments: markupN,
      monthlyOutflow: round2(markupTotal / markupN),
    },
    {
      id: "strat_save",
      name: PURCHASE_MODE_LABELS.save_then_buy,
      mode: "save_then_buy",
      amount: vista,
      installments: Math.min(18, Math.max(n, 6)),
      monthlyOutflow: round2(vista / Math.min(18, Math.max(n, 6))),
    },
    {
      id: "strat_consortium",
      name: PURCHASE_MODE_LABELS.consortium,
      mode: "consortium",
      amount: vista,
      installments: Math.max(36, n * 3),
      monthlyOutflow: round2(vista / Math.max(36, n * 3)),
    },
    {
      id: "strat_financing",
      name: PURCHASE_MODE_LABELS.financing_interest,
      mode: "financing_interest",
      amount: vista,
      installments: Math.max(n, 12),
      monthlyRatePct: 1.79,
    },
    {
      id: "strat_sub",
      name: PURCHASE_MODE_LABELS.subscription,
      mode: "subscription",
      amount: round2(vista * 0.035),
      installments: 12,
      monthlyOutflow: round2(vista * 0.035),
    },
    {
      id: "strat_lease",
      name: PURCHASE_MODE_LABELS.leasing,
      mode: "leasing",
      amount: round2(vista * 0.028),
      installments: Math.max(24, n * 2),
      monthlyOutflow: round2(vista * 0.028),
      residualAmount: round2(vista * 0.35),
    },
  ];

  return simulatePurchaseAlternatives(
    {
      ...context,
      referenceCashPrice: vista,
      referenceFinancedTotal: prazo || vista,
      maxInterestFreeInstallments: n,
      horizonMonths: context.horizonMonths ?? 12,
    },
    alts,
  );
}

/** Compat: 2 alternativas fixas (à vista + parcelado). */
export function simulatePurchase(
  input: PurchaseSimulationInput,
): PurchaseSimulationResult {
  const markup = embeddedMarkupPercent(input.cashPrice, input.financedTotal);
  const zero = markup != null && markup <= 0.5;
  return simulatePurchaseAlternatives(
    {
      investmentName: input.investmentName,
      investmentBalance: input.investmentBalance,
      pctOfCdi: input.pctOfCdi,
      cdiAnnual: input.cdiAnnual,
      irRate: input.irRate,
      monthlySavings: input.monthlySavings,
      horizonMonths: input.horizonMonths,
      referenceCashPrice: input.cashPrice,
      referenceFinancedTotal: input.financedTotal,
      maxInterestFreeInstallments: input.installments,
    },
    [
      {
        id: "alt_cash",
        name: input.cashLabel ?? PURCHASE_MODE_LABELS.cash_reverse,
        mode: "cash_reverse",
        amount: input.cashPrice,
        installments: input.installments,
        monthlyOutflow:
          input.financedTotal / Math.max(1, input.installments),
      },
      {
        id: "alt_financed",
        name: input.financedLabel ??
          (zero
            ? PURCHASE_MODE_LABELS.installments_zero
            : PURCHASE_MODE_LABELS.installments_markup),
        mode: zero ? "installments_zero" : "installments_markup",
        amount: input.financedTotal,
        installments: input.installments,
      },
    ],
  );
}

function buildMarkdownReport(args: {
  verdictTitle: string;
  context: PurchaseContextInput;
  results: PurchaseAlternativeResult[];
  ranking: PurchaseSimulationResult["ranking"];
  best: PurchaseSimulationResult["ranking"][0] | null;
  netAnnual: number;
  grossAnnual: number;
  referenceCash: number;
  referenceFinanced: number;
  markupPct: number | null;
  automation: PurchaseSimulationResult["automation"];
  ir: number;
  recommendedAction: string;
}): string {
  const brl = (x: number) =>
    x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (x: number) => `${(x * 100).toFixed(2).replace(".", ",")}%`;

  const a = args.results.find((x) => x.mode === "cash_reverse");
  const b = args.results.find(
    (x) =>
      x.mode === "installments_zero" ||
      x.mode === "installments_markup" ||
      x.mode === "financing_interest",
  );

  const ordered = args.ranking
    .map((r) => args.results.find((a) => a.id === r.id))
    .filter((a): a is PurchaseAlternativeResult => Boolean(a));
  const header = `| Mês | ${ordered.map((x, i) => `${i + 1}º ${x.name}`).join(" | ")} |`;
  const sep = `| ---: | ${ordered.map(() => "---:").join(" | ")} |`;
  const rows: string[] = [];
  for (const m of [0, 3, 6, 12]) {
    if (m > (args.context.horizonMonths ?? 12)) continue;
    const cells = ordered.map((alt) => {
      const p = alt.months.find((x) => x.month === m);
      return p ? brl(p.investmentBalance) : "—";
    });
    rows.push(`| ${m} | ${cells.join(" | ")} |`);
  }

  const rankLines = args.ranking.map(
    (r, i) =>
      `${i + 1}. **${r.name}** — score ${brl(r.scoreWealth)} (saldo ${brl(r.finalInvestment)})${
        r.gapToBest > 0 ? ` (${brl(r.gapToBest)} atrás)` : " ← melhor"
      }`,
  );

  const detailRows = args.results.map(
    (alt) =>
      `| ${alt.name} | ${PURCHASE_MODE_LABELS[alt.mode]} | ${brl(alt.amount)} | ${alt.installments}× ${brl(alt.monthlyOutflow)} | ${
        alt.impliedAnnualRate == null ? "—" : pct(alt.impliedAnnualRate)
      } | ${alt.ownsAsset ? "sim" : "não"} |`,
  );

  const abTable =
    a && b
      ? [
          "",
          "### Impacto no patrimônio (Cenário A vs B — 12 meses)",
          "",
          `| Cenário | Saldo final aplicação |`,
          `| --- | ---: |`,
          `| A — ${a.name} | ${brl(a.finalInvestment)} |`,
          `| B — ${b.name} | ${brl(b.finalInvestment)} |`,
        ]
      : [];

  return [
    `**${args.verdictTitle}**`,
    "",
    "### Variáveis da intenção",
    "",
    `- VALOR_A_VISTA: ${brl(args.referenceCash)}`,
    `- VALOR_A_PRAZO: ${brl(args.referenceFinanced)}`,
    `- Taxa de acréscimo embutida: ${
      args.markupPct == null
        ? "—"
        : `${args.markupPct.toFixed(2).replace(".", ",")}%`
    }`,
    `- Aplicação: **${args.context.investmentName}** (${brl(args.context.investmentBalance)}) · bruto ${pct(args.grossAnnual)} · líquido ${pct(args.netAnnual)} (IR ${pct(args.ir)})`,
    `- Urgência: ${args.context.urgency ?? "media"}`,
    ...abTable,
    "",
    "### Estratégias avaliadas",
    "",
    `| Alternativa | Estratégia | Valor | Fluxo | Juros embut. a.a. | Bem? |`,
    `| --- | --- | ---: | ---: | ---: | --- |`,
    ...detailRows,
    "",
    "### Ranking (patrimônio efetivo)",
    "",
    ...rankLines,
    "",
    "### Linha do tempo (melhor → pior)",
    "",
    header,
    sep,
    ...rows,
    "",
    args.markupPct != null && args.markupPct > 0.5
      ? `### Alerta de custo oculto\n\nAo aceitar o preço a prazo você embute **${args.markupPct.toFixed(2).replace(".", ",")}%** sobre o à vista ((prazo − vista) / vista).`
      : args.markupPct != null && args.markupPct <= 0.5
        ? `### Arbitragem\n\nParcelado ≈ à vista (acréscimo ~0%). Manter o saldo rendendo pode vencer o resgate imediato.`
        : "",
    "",
    args.automation
      ? `### Automação sugerida\n\nMeta **${args.automation.goalName}**: ${brl(args.automation.monthlyAmount)}/mês por ${args.automation.months} meses (alvo ${brl(args.automation.targetAmount)}).`
      : "",
    "",
    `### Ação no app\n\n${args.recommendedAction}`,
    "",
    "_Cálculo 100% local no dispositivo. Premissas de CDI/IR editáveis. Sem nuvem._",
  ]
    .filter(Boolean)
    .join("\n");
}
