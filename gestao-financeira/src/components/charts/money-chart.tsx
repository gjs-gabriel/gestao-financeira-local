"use client";

import type { ReactNode } from "react";
import { CartesianGrid } from "recharts";

/**
 * Cores de série — semântica financeira
 * Entradas/positivo → income | Saídas → expense | Dívida → debt
 * Investimento → invest | Marca/PL/saldo → brand
 */
export const CHART_BRAND = "var(--color-chart-brand)";
export const CHART_INCOME = "var(--color-income)";
export const CHART_EXPENSE = "var(--color-expense)";
export const CHART_DEBT = "var(--color-debt)";
export const CHART_INVEST = "var(--color-investment)";
export const CHART_INSIGHT = "var(--color-insight)";

/** @deprecated Preferir CHART_BRAND */
export const CHART_TEAL = CHART_BRAND;
/** @deprecated Preferir CHART_EXPENSE */
export const CHART_AMBER = CHART_EXPENSE;
/** @deprecated Preferir CHART_INVEST */
export const CHART_BLUE = CHART_INVEST;
/** @deprecated Preferir CHART_DEBT */
export const CHART_ROSE = CHART_DEBT;

/** Categorias / séries neutras — mid-chroma distintas */
export const CAT_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** @deprecated Preferir <GlassChartTooltip /> */
export const chartTooltipStyle = {
  borderRadius: 12,
  border: "1px solid oklch(1 0 0 / 0.2)",
  background: "oklch(from var(--card) l c h / 0.85)",
  backdropFilter: "blur(12px)",
  fontSize: 12,
  boxShadow: "var(--shadow-premium)",
};

/** Rótulos de eixo — tipografia muted minimalista */
export const chartAxisTick = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
  fontWeight: 500 as const,
};

/** Aliases usados nas páginas */
export const monthAxisTick = chartAxisTick;
export const valueAxisTick = chartAxisTick;

export const CHART_BAR_SIZE = 12;
export const CHART_BAR_GAP = 6;
export const CHART_STROKE = 3;
export const CHART_BAR_RADIUS_TOP: [number, number, number, number] = [4, 4, 0, 0];
export const CHART_BAR_RADIUS_END: [number, number, number, number] = [0, 4, 4, 0];
export const CHART_BAR_CLASS =
  "opacity-85 transition-opacity duration-200 hover:opacity-100 cursor-pointer";

/** Gradiente vertical para Area — topo semântico → transparente */
export function ChartGradient({
  id,
  color,
}: {
  id: string;
  color: string;
}) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.24} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

/** Grid só horizontal, tracejado sutil */
export function ChartGrid() {
  return (
    <CartesianGrid
      vertical={false}
      strokeDasharray="4 6"
      stroke="oklch(from var(--border) l c h / 0.22)"
    />
  );
}

type TooltipEntry = {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  payload?: unknown;
};

type GlassTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: unknown;
  formatter?: (
    value: unknown,
    name: unknown,
    item: TooltipEntry,
  ) => ReactNode | [ReactNode, ReactNode];
};

/** Tooltip glassmorphic acessível (substitui a caixa branca padrão) */
export function GlassChartTooltip({
  active,
  payload,
  label,
  formatter,
}: GlassTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[8.5rem] rounded-xl border border-white/20 bg-card/85 px-3 py-2.5 text-xs shadow-[var(--shadow-premium)] backdrop-blur-md">
      {label != null && String(label) !== "" ? (
        <p className="mb-1.5 font-medium text-foreground">{String(label)}</p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry, i) => {
          let display: ReactNode = entry.value as ReactNode;
          let name: ReactNode = entry.name;
          if (formatter) {
            const formatted = formatter(entry.value, entry.name, entry);
            if (Array.isArray(formatted)) {
              display = formatted[0];
              name = formatted[1] ?? name;
            } else {
              display = formatted;
            }
          } else if (typeof entry.value === "number") {
            display = tooltipBrl(entry.value);
          }
          return (
            <li
              key={`${String(entry.dataKey ?? entry.name)}-${i}`}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.color ?? "var(--color-chart-brand)" }}
                aria-hidden
              />
              <span className="min-w-0 truncate">{name}</span>
              <span className="ml-auto shrink-0 font-medium tabular-nums text-foreground">
                {display}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
