export const CHART_TEAL = "oklch(0.42 0.09 175)";
export const CHART_AMBER = "oklch(0.55 0.1 55)";
export const CHART_BLUE = "oklch(0.48 0.1 250)";
export const CHART_ROSE = "oklch(0.5 0.12 20)";

export const CAT_COLORS = [
  "oklch(0.45 0.09 175)",
  "oklch(0.55 0.1 55)",
  "oklch(0.48 0.1 250)",
  "oklch(0.5 0.08 200)",
  "oklch(0.52 0.1 25)",
];

export const chartTooltipStyle = {
  borderRadius: 8,
  border: "1px solid oklch(0.9 0.015 165)",
  fontSize: 12,
};

export const monthAxisTick = { fontSize: 11, fill: "oklch(0.5 0.02 170)" };
export const valueAxisTick = { fontSize: 10, fill: "oklch(0.5 0.02 170)" };

export function brlTick(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function tooltipBrl(value: unknown): string {
  if (typeof value !== "number") return String(value ?? "");
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function tooltipPercent(value: unknown): string {
  if (typeof value !== "number") return String(value ?? "");
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function percentDomain(
  [dataMin, dataMax]: readonly [number, number],
): readonly [number, number] {
  return [
    Math.min(0, Number.isFinite(dataMin) ? dataMin : 0),
    Math.max(0, Number.isFinite(dataMax) ? dataMax : 0),
  ];
}
