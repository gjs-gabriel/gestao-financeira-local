import { PURCHASE_MODE_LABELS, type PurchaseAltMode } from "@gf/core";

/** ID local — evita createId do @gf/core (ciclo snapshot↔migrate no Metro). */
function localId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const WIZARD_STEPS: { step: WizardStep; title: string; short: string }[] =
  [
    { step: 1, title: "Descreva a compra", short: "Texto" },
    { step: 2, title: "Valores e estratégias", short: "Estratégias" },
    { step: 3, title: "Origem do dinheiro", short: "Aplicação" },
    { step: 4, title: "Confirmação", short: "Confirmar" },
    { step: 5, title: "Resultados", short: "Resultado" },
  ];

export type AltDraft = {
  id: string;
  name: string;
  mode: PurchaseAltMode;
  amount: string;
  installments: string;
  monthlyOutflow: string;
  residualAmount: string;
  monthlyRatePct: string;
};

export function parseMoneyInput(raw: string): number {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",")) {
    return Number(t.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(t) || 0;
}

export function formatMoneyInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

export function altFields(mode: PurchaseAltMode): {
  showAmount: boolean;
  showMonthly: boolean;
  showResidual: boolean;
  showRate: boolean;
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

export function newAlt(partial?: Partial<AltDraft>): AltDraft {
  return {
    id: localId("alt"),
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

export function altDisplayName(alt: Pick<AltDraft, "name" | "mode">): string {
  return alt.name.trim() || PURCHASE_MODE_LABELS[alt.mode];
}

export function amountLabel(mode: PurchaseAltMode): string {
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

export function installmentsLabel(mode: PurchaseAltMode): string {
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

export function monthlyLabel(mode: PurchaseAltMode): string {
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

export function seedAltForMode(
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
      return newAlt({ mode, amount: prazo, installments: parcels });
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

export const URGENCY_OPTIONS = [
  { value: "baixa" as const, label: "Baixa" },
  { value: "media" as const, label: "Média" },
  { value: "alta" as const, label: "Alta" },
];
