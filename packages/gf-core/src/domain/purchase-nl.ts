/**
 * Traduz descrição em linguagem natural → intenção + alternativas de compra.
 * Heurística local (sem IA); a UI pode enriquecer com o Analista local.
 */

import {
  MAX_PURCHASE_ALTERNATIVES,
  PURCHASE_MODE_OPTIONS,
  recommendPurchaseStrategies,
  type PurchaseAltMode,
  type PurchaseAlternativeInput,
  type PurchaseUrgency,
} from "./purchase-simulation";

export type PurchaseNlAlt = {
  mode: PurchaseAltMode;
  amount: number;
  installments: number;
  monthlyOutflow?: number;
  residualAmount?: number;
  monthlyRatePct?: number;
  /** Rótulo no ranking (ex.: "Pix", "Cartão 10×") quando há mais de uma do mesmo modo. */
  label?: string;
};

export type PurchaseNlPlan = {
  cashPrice?: number;
  financedTotal?: number;
  maxInstallments?: number;
  urgency?: PurchaseUrgency;
  alternatives: PurchaseNlAlt[];
  source: "local" | "ai";
};

export type PurchaseOffer = {
  kind: "cash" | "installments_zero" | "financing";
  amount: number;
  installments: number;
  label: string;
};

const MODE_KEYWORDS: { mode: PurchaseAltMode; patterns: RegExp[] }[] = [
  {
    mode: "cash_reverse",
    patterns: [
      /parcela\s*reversa/i,
      /[àa]\s*vista/i,
      /\bpix\b/i,
      /resgat/i,
      /reinvest/i,
    ],
  },
  {
    mode: "installments_zero",
    patterns: [
      /parcelad[oa].*(sem\s*juros|0\s*%|juros\s*zero)/i,
      /sem\s*juros/i,
      /cart[aã]o/i,
      /credi[aá]rio/i,
      /\b\d+\s*[x×]\b/i,
    ],
  },
  {
    mode: "installments_markup",
    patterns: [
      /parcelamento\s+com\s+acr[eé]scimo/i,
      /a\s+prazo\s+com\s+acr[eé]scimo/i,
      /acr[eé]scimo\s+embut/i,
      /juros\s+embut/i,
    ],
  },
  {
    mode: "save_then_buy",
    patterns: [
      /ac[uú]mulo/i,
      /juntar/i,
      /poupar/i,
      /guardar/i,
      /antes\s+de\s+comprar/i,
      /meta/i,
    ],
  },
  {
    mode: "consortium",
    patterns: [/cons[oó]rcio/i, /carta\s+de\s+cr[eé]dito/i],
  },
  {
    mode: "financing_interest",
    patterns: [
      /financi/i,
      /\d+[.,]\d+\s*%\s*(a\.?\s*m\.?|ao\s*m[eê]s)/i,
      /taxa\s*(de\s*)?(juros|am)/i,
    ],
  },
  {
    mode: "subscription",
    patterns: [/assinatura/i, /loca[cç][aã]o/i, /\baluguel\b/i],
  },
  {
    mode: "leasing",
    patterns: [/leasing/i, /arrendamento/i],
  },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBrlToken(raw: string): number | null {
  const t = raw.trim().replace(/^r\$\s*/i, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+,\d{1,2}$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const n = Number(t.replace(/\./g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Extrai valores monetários mencionados no texto (ordem de aparição). */
export function extractMoneyAmountsFromText(text: string): number[] {
  const amounts: number[] = [];
  const re =
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{4,}(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d+\s*mil\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const token = m[1]!;
    if (/\s*mil\b/i.test(token)) {
      const base = Number(token.replace(/\s*mil\b/i, "").replace(",", "."));
      if (Number.isFinite(base) && base > 0) amounts.push(base * 1000);
      continue;
    }
    const n = parseBrlToken(token);
    if (n != null) amounts.push(n);
  }
  return amounts;
}

export function extractInstallmentsFromText(text: string): number | null {
  const m =
    text.match(/(\d{1,3})\s*[x×]\b/i) ||
    text.match(/(\d{1,3})\s*(?:parcelas?|vezes|meses)\b/i);
  if (!m) return null;
  const n = Math.floor(Number(m[1]));
  return n >= 1 && n <= 120 ? n : null;
}

export function extractAllInstallmentsFromText(text: string): number[] {
  const found: number[] = [];
  const re = /(\d{1,3})\s*[x×]\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const n = Math.floor(Number(m[1]));
    if (n >= 1 && n <= 120 && !found.includes(n)) found.push(n);
  }
  return found;
}

/**
 * Extrai ofertas concretas (Pix / N×) do texto.
 * Ex.: "8999 no pix ou 9999 no cartão (até 10x sem juros ou 10200 em 12x)"
 * Ex.: "carro de 220.000. No Pix tem 10.000 de desconto; parcelar 220.000 sem juros, ou 12× (230.000)"
 */
export function extractPurchaseOffersFromText(text: string): PurchaseOffer[] {
  const offers: PurchaseOffer[] = [];
  const seen = new Set<string>();

  const push = (o: PurchaseOffer) => {
    const key = `${o.kind}:${o.amount}:${o.installments}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push(o);
  };

  const moneyToken = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{4,}(?:[.,]\d{1,2})?)`;

  // Preço de tabela / “de R$ X”
  let listPrice: number | null = null;
  const listRe = new RegExp(
    `(?:carro|moto|bem|produto|compra|iphone|celular|notebook)?[^0-9]{0,24}?de\\s*(?:r\\$\\s*)?${moneyToken}`,
    "i",
  );
  const listM = text.match(listRe);
  if (listM) listPrice = parseBrlToken(listM[1] || "");

  // Desconto no Pix: “Pix tem R$ 10.000 de desconto” / “desconto de R$ 10.000 no Pix”
  let pixDiscount: number | null = null;
  const discountRe = new RegExp(
    `(?:(?:pix|[àa]\\s*vista)[^0-9]{0,40}?${moneyToken}\\s*(?:de\\s*)?desconto)|(?:desconto\\s*(?:de\\s*)?(?:r\\$\\s*)?${moneyToken}[^0-9]{0,24}?(?:pix|[àa]\\s*vista)|(?:r\\$\\s*)?${moneyToken}\\s*(?:de\\s*)?desconto\\s*(?:no\\s*)?(?:pix|[àa]\\s*vista))`,
    "gi",
  );
  for (const m of text.matchAll(discountRe)) {
    const d = parseBrlToken(m[1] || m[2] || m[3] || "");
    if (d != null && d > 0) {
      pixDiscount = d;
      break;
    }
  }

  // Pix / à vista / parcela reversa com preço explícito
  const cashRe = new RegExp(
    `${moneyToken}\\s*(?:no\\s+)?(?:pix|[àa]\\s*vista)\\b|\\b(?:pix|[àa]\\s*vista|parcela\\s*reversa)\\s*(?:[^0-9]{0,40}?)(?:r\\$\\s*)?${moneyToken}`,
    "gi",
  );
  for (const m of text.matchAll(cashRe)) {
    const amount = parseBrlToken(m[1] || m[2] || "");
    if (!amount) continue;
    // Evita capturar o próprio desconto como preço (“Pix tem 10.000 de desconto”)
    const around = text.slice(
      Math.max(0, (m.index ?? 0) - 8),
      Math.min(text.length, (m.index ?? 0) + m[0].length + 16),
    );
    if (/desconto/i.test(around) && pixDiscount != null && amount === pixDiscount) {
      continue;
    }
    push({
      kind: "cash",
      amount,
      installments: 1,
      label: "Pix / à vista",
    });
  }

  // Pix = preço de tabela − desconto
  if (!offers.some((o) => o.kind === "cash") && listPrice != null) {
    const cash =
      pixDiscount != null && pixDiscount < listPrice
        ? round2(listPrice - pixDiscount)
        : listPrice;
    push({
      kind: "cash",
      amount: cash,
      installments: 1,
      label:
        pixDiscount != null
          ? `Pix / à vista (−${pixDiscount.toLocaleString("pt-BR")})`
          : "Pix / à vista",
    });
  }

  // “parcelar R$ 220.000 sem juros” (sem N explícito ao lado)
  const parcelZeroRe = new RegExp(
    `(?:parcelar|parcelado|cart[aã]o)\\s*(?:em\\s*)?(?:r\\$\\s*)?${moneyToken}[^0-9]{0,28}?sem\\s*juros`,
    "gi",
  );
  for (const m of text.matchAll(parcelZeroRe)) {
    const amount = parseBrlToken(m[1] || "");
    if (!amount) continue;
    const ns = extractAllInstallmentsFromText(text);
    const n = ns[0] && ns[0] >= 2 ? ns[0] : 10;
    // Se o texto já tem outros Nx com totais, use N “típico” 10/12 só se não houver
    // oferta zero com N; preferir 10 quando há 12×/13× de markup no mesmo texto
    const nZero =
      ns.find((x) => x === 10) ??
      (ns.every((x) => x >= 12) ? 10 : ns[0] ?? 10);
    push({
      kind: "installments_zero",
      amount,
      installments: Math.min(120, Math.max(2, nZero || n)),
      label: "Cartão sem juros",
    });
  }

  // TOTAL em Nx | TOTAL no cartão … Nx
  const amountThenN = new RegExp(
    `${moneyToken}\\s*(?:em\\s*|no\\s+cart[aã]o[^0-9]{0,40}?|no\\s+credi[aá]rio[^0-9]{0,40}?)(?:at[eé]\\s*)?(\\d{1,3})\\s*[x×]`,
    "gi",
  );
  const zeroInterestNear = (match: RegExpMatchArray) => {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // Sufixo: “10x sem juros”
    if (
      /sem\s*juros|juros\s*zero|0\s*%/i.test(
        text.slice(start, Math.min(text.length, end + 28)),
      )
    ) {
      return true;
    }
    // Prefixo na mesma oferta: “parcelado sem juros de 9000 em 10x”
    // Não cruza “;” / “, ou” (outra oferta: “sem juros, ou 12× …”)
    const before = text.slice(Math.max(0, start - 56), start);
    const sem = before.match(/(?:sem\s*juros|juros\s*zero|0\s*%)(.*)$/i);
    if (!sem) return false;
    const bridge = sem[1] ?? "";
    return !/[;,]|\bou\b/i.test(bridge);
  };

  for (const m of text.matchAll(amountThenN)) {
    const amount = parseBrlToken(m[1] || "");
    const n = Math.floor(Number(m[2]));
    if (!amount || !(n >= 2 && n <= 120)) continue;
    const zeroInterest = zeroInterestNear(m);
    push({
      kind: zeroInterest ? "installments_zero" : "financing",
      amount,
      installments: n,
      label: zeroInterest ? `Cartão ${n}× sem juros` : `Cartão ${n}×`,
    });
  }

  // Nx de/por TOTAL — "10x de 9999" ou "12× (R$ 230.000)"
  const nThenAmount = new RegExp(
    `(\\d{1,3})\\s*[x×]\\s*(?:de|por|:|\\()?\\s*(?:r\\$\\s*)?${moneyToken}\\)?`,
    "gi",
  );
  for (const m of text.matchAll(nThenAmount)) {
    const n = Math.floor(Number(m[1]));
    const amount = parseBrlToken(m[2] || "");
    if (!amount || !(n >= 2 && n <= 120)) continue;
    const zeroInterest = zeroInterestNear(m);
    push({
      kind: zeroInterest ? "installments_zero" : "financing",
      amount,
      installments: n,
      label: zeroInterest ? `Cartão ${n}× sem juros` : `Cartão ${n}×`,
    });
  }

  const cashAmount = offers.find((o) => o.kind === "cash")?.amount;
  // Confia em “sem juros” do extrator; só rebaixa financing→zero se total ≈ tabela/Pix.
  // Não usa Pix como teto de acréscimo (220k sem juros vs Pix 210k é válido).
  return offers.map((o) => {
    if (o.kind === "cash") return o;
    if (o.kind === "installments_zero") return o;
    const nearList =
      listPrice != null && o.amount <= listPrice * 1.005;
    const nearCash =
      cashAmount != null && o.amount <= cashAmount * 1.005;
    if (nearList || nearCash) {
      return {
        ...o,
        kind: "installments_zero" as const,
        label:
          o.installments > 1
            ? `Cartão ${o.installments}× sem juros`
            : "Cartão sem juros",
      };
    }
    return {
      ...o,
      kind: "financing" as const,
      label: `Cartão ${o.installments}× (com acréscimo)`,
    };
  });
}

function offersToAlternatives(offers: PurchaseOffer[]): PurchaseNlAlt[] {
  const cash = offers.find((o) => o.kind === "cash");
  const cardZero = offers.filter((o) => o.kind === "installments_zero");
  const cardFin = offers.filter((o) => o.kind === "financing");
  const alts: PurchaseNlAlt[] = [];

  if (cash) {
    const ref = cardZero[0] ?? cardFin[0];
    const n = ref?.installments ?? 10;
    const prazo = ref?.amount ?? cash.amount;
    alts.push({
      mode: "cash_reverse",
      amount: cash.amount,
      installments: n,
      monthlyOutflow: round2(prazo / n),
      label: cash.label,
    });
  }

  for (const o of cardZero) {
    alts.push({
      mode: "installments_zero",
      amount: o.amount,
      installments: o.installments,
      monthlyOutflow: round2(o.amount / o.installments),
      label: o.label,
    });
  }

  for (const o of cardFin) {
    alts.push({
      mode: "installments_markup",
      amount: o.amount,
      installments: o.installments,
      monthlyOutflow: round2(o.amount / o.installments),
      label: o.label,
    });
  }

  return alts.slice(0, MAX_PURCHASE_ALTERNATIVES);
}

export function detectPurchaseModesFromText(text: string): PurchaseAltMode[] {
  const found: PurchaseAltMode[] = [];
  for (const { mode, patterns } of MODE_KEYWORDS) {
    if (patterns.some((p) => p.test(text))) found.push(mode);
  }
  if (
    /todas|as\s*7|sete\s*estrat|comparar\s*tudo|recomendar/i.test(text) ||
    found.length === 0
  ) {
    return [...PURCHASE_MODE_OPTIONS];
  }
  return found.slice(0, MAX_PURCHASE_ALTERNATIVES);
}

export function detectUrgencyFromText(text: string): PurchaseUrgency | undefined {
  if (/urg[eê]ncia\s*(alta|alta\s*urg)|preciso\s*(agora|j[aá])|urgente/i.test(text))
    return "alta";
  if (/urg[eê]ncia\s*baixa|posso\s*esperar|sem\s*pressa/i.test(text))
    return "baixa";
  if (/urg[eê]ncia\s*m[eé]dia/i.test(text)) return "media";
  return undefined;
}

function buildAlt(
  mode: PurchaseAltMode,
  vista: number,
  prazo: number,
  n: number,
): PurchaseNlAlt {
  const parcela =
    prazo > 0 ? round2(prazo / n) : round2(vista / n);
  switch (mode) {
    case "cash_reverse":
      return {
        mode,
        amount: vista,
        installments: n,
        monthlyOutflow: parcela,
      };
    case "installments_zero":
      return {
        mode,
        amount: prazo > 0 ? prazo : vista,
        installments: n,
      };
    case "installments_markup": {
      const total = Math.max(prazo, round2(vista * 1.12));
      return {
        mode,
        amount: total,
        installments: n,
        monthlyOutflow: round2(total / n),
      };
    }
    case "save_then_buy": {
      const months = Math.min(18, Math.max(n, 6));
      return {
        mode,
        amount: vista,
        installments: months,
        monthlyOutflow: round2(vista / months),
      };
    }
    case "consortium": {
      const months = Math.max(36, n * 3);
      return {
        mode,
        amount: vista,
        installments: months,
        monthlyOutflow: round2(vista / months),
      };
    }
    case "financing_interest": {
      return {
        mode,
        amount: vista,
        installments: Math.max(n, 12),
        monthlyRatePct: 1.79,
      };
    }
    case "subscription": {
      const fee = round2(vista * 0.035);
      return { mode, amount: fee, installments: 12, monthlyOutflow: fee };
    }
    case "leasing": {
      const fee = round2(vista * 0.028);
      return {
        mode,
        amount: fee,
        installments: Math.max(24, n * 2),
        monthlyOutflow: fee,
        residualAmount: round2(vista * 0.35),
      };
    }
  }
}

/**
 * Heurística local: extrai números/estratégias do texto e monta o plano.
 * Se o texto pedir comparação ampla (ou não citar estratégia), gera as 7.
 */
export function planPurchaseFromNaturalLanguage(
  text: string,
  defaults?: {
    cashPrice?: number;
    financedTotal?: number;
    maxInstallments?: number;
    urgency?: PurchaseUrgency;
  },
): PurchaseNlPlan {
  const trimmed = text.trim();
  const offers = extractPurchaseOffersFromText(trimmed);
  const urgency = detectUrgencyFromText(trimmed) ?? defaults?.urgency;

  // Caminho preferido: cada preço/parcelamento vira uma alternativa
  if (offers.length >= 2) {
    const alternatives = offersToAlternatives(offers);
    const cash = offers.find((o) => o.kind === "cash");
    const cards = offers.filter((o) => o.kind !== "cash");
    const maxN = Math.max(
      ...offers.map((o) => o.installments),
      defaults?.maxInstallments ?? 0,
      1,
    );
    const zeroCard = cards.find((o) => o.kind === "installments_zero");
    return {
      cashPrice: cash?.amount,
      financedTotal: zeroCard?.amount ?? cards[0]?.amount,
      maxInstallments: maxN >= 2 ? maxN : defaults?.maxInstallments,
      urgency,
      alternatives,
      source: "local",
    };
  }

  const amounts = extractMoneyAmountsFromText(trimmed);
  const n =
    extractInstallmentsFromText(trimmed) ??
    defaults?.maxInstallments ??
    10;
  let vista = amounts[0] ?? defaults?.cashPrice ?? 0;
  let prazo =
    amounts[1] ?? defaults?.financedTotal ?? (amounts[0] ? amounts[0] : 0);
  // “220.000 … 10.000 de desconto” → à vista = tabela − desconto; prazo = tabela
  if (
    amounts.length >= 2 &&
    amounts[0]! > 0 &&
    amounts[1]! > 0 &&
    amounts[1]! < amounts[0]! * 0.35 &&
    /desconto/i.test(trimmed)
  ) {
    const list = amounts[0]!;
    const discount = amounts[1]!;
    vista = round2(list - discount);
    prazo =
      amounts.find((a, i) => i > 1 && a >= list * 0.95 && a <= list * 1.05) ??
      list;
  }
  if (vista > 0 && prazo <= 0) prazo = vista;
  if (prazo > 0 && vista <= 0) vista = prazo;

  const modes = detectPurchaseModesFromText(trimmed);

  const wantAll =
    modes.length === PURCHASE_MODE_OPTIONS.length ||
    /todas|as\s*7|sete\s*estrat|comparar\s*tudo|recomendar/i.test(trimmed);

  if (wantAll && vista > 0) {
    const sim = recommendPurchaseStrategies({
      investmentName: "Origem",
      investmentBalance: Math.max(vista * 3, 20_000),
      pctOfCdi: 100,
      cdiAnnual: 0.1415,
      irRate: 0.175,
      monthlySavings: 750,
      horizonMonths: 12,
      cashPrice: vista,
      financedTotal: prazo > 0 ? prazo : vista,
      maxInstallments: n,
      urgency: urgency ?? "media",
    });
    return {
      cashPrice: vista,
      financedTotal: prazo > 0 ? prazo : vista,
      maxInstallments: n,
      urgency,
      alternatives: sim.alternatives.map((a) => ({
        mode: a.mode,
        amount: a.amount,
        installments: a.installments,
        monthlyOutflow: a.monthlyOutflow,
        residualAmount: a.residualAmount > 0 ? a.residualAmount : undefined,
      })),
      source: "local",
    };
  }

  const alternatives = modes.map((mode) =>
    buildAlt(mode, vista > 0 ? vista : 8000, prazo > 0 ? prazo : vista || 8000, n),
  );

  return {
    cashPrice: vista > 0 ? vista : undefined,
    financedTotal: prazo > 0 ? prazo : undefined,
    maxInstallments: n,
    urgency,
    alternatives,
    source: "local",
  };
}

function asMode(v: unknown): PurchaseAltMode | null {
  return typeof v === "string" &&
    (PURCHASE_MODE_OPTIONS as string[]).includes(v)
    ? (v as PurchaseAltMode)
    : null;
}

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extrai JSON de plano a partir da resposta do modelo (com ou sem fence). */
export function parsePurchaseNlPlanFromAi(raw: string): PurchaseNlPlan | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const altsRaw = Array.isArray(rec.alternatives) ? rec.alternatives : [];
  const alternatives: PurchaseNlAlt[] = [];
  for (const item of altsRaw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const mode = asMode(a.mode);
    const amount = asPositiveNumber(a.amount);
    const installments = asPositiveNumber(a.installments);
    if (!mode || amount == null || installments == null) continue;
    const monthly = asPositiveNumber(a.monthlyOutflow);
    const residual = asPositiveNumber(a.residualAmount);
    const rate = asPositiveNumber(a.monthlyRatePct);
    const label =
      typeof a.label === "string" && a.label.trim()
        ? a.label.trim()
        : typeof a.name === "string" && a.name.trim()
          ? a.name.trim()
          : undefined;
    alternatives.push({
      mode,
      amount,
      installments: Math.min(120, Math.floor(installments)),
      monthlyOutflow: monthly ?? undefined,
      residualAmount: residual ?? undefined,
      monthlyRatePct: rate ?? undefined,
      label,
    });
    if (alternatives.length >= MAX_PURCHASE_ALTERNATIVES) break;
  }
  if (alternatives.length === 0) return null;

  const urgencyRaw = rec.urgency;
  const urgency =
    urgencyRaw === "baixa" || urgencyRaw === "media" || urgencyRaw === "alta"
      ? urgencyRaw
      : undefined;

  return {
    cashPrice: asPositiveNumber(rec.cashPrice) ?? undefined,
    financedTotal: asPositiveNumber(rec.financedTotal) ?? undefined,
    maxInstallments: asPositiveNumber(rec.maxInstallments)
      ? Math.floor(asPositiveNumber(rec.maxInstallments)!)
      : undefined,
    urgency,
    alternatives,
    source: "ai",
  };
}

/** Converte plano NL em inputs do motor (com ids). */
export function purchaseNlPlanToInputs(
  plan: PurchaseNlPlan,
): PurchaseAlternativeInput[] {
  return plan.alternatives.map((a, i) => ({
    id: `nl_${i}_${a.mode}`,
    name: a.label?.trim() || a.mode,
    mode: a.mode,
    amount: a.amount,
    installments: a.installments,
    monthlyOutflow: a.monthlyOutflow,
    residualAmount: a.residualAmount,
    monthlyRatePct: a.monthlyRatePct,
  }));
}
