import { useState, type ComponentType, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  type LayoutChangeEvent,
} from "react-native";
import { colors, fonts } from "../theme";

/** Cores alinhadas à web (money-chart.tsx). */
export const CHART = {
  brand: "#2a6b5a",
  income: "#2d9b6f",
  expense: "#c9892a",
  debt: "#c94a3a",
  invest: "#3b6fd9",
  insight: "#3aa0b8",
  cats: ["#1a5c4a", "#3aa0b8", "#3b6fd9", "#c9892a", "#c94a3a"] as const,
};

const Y_AXIS_W = 44;
const X_LABEL_H = 22;
const CHART_PAD = 4;

export type StackSeries = { key: string; name: string; color: string };
export type StackRow = { label: string; values: Record<string, number> };
export type MoneyBarPoint = {
  label: string;
  value: number;
  frontColor?: string;
};
export type MoneyLinePoint = { label: string; value: number };
export type MoneyGroupedBar = { label: string; a: number; b: number };

type Gifted = {
  BarChart: ComponentType<Record<string, unknown>>;
  LineChart: ComponentType<Record<string, unknown>>;
};

let giftedCache: Gifted | null | undefined;

/** Carrega gifted-charts sob demanda — falha vira fallback, não crash no boot. */
function getGifted(): Gifted | null {
  if (giftedCache !== undefined) return giftedCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-gifted-charts") as Gifted;
    if (!mod?.BarChart || !mod?.LineChart) {
      giftedCache = null;
      return null;
    }
    giftedCache = mod;
    return mod;
  } catch (e) {
    console.warn("[MoneyCharts] gifted-charts indisponível", e);
    giftedCache = null;
    return null;
  }
}

function formatCompactBrl(value: number): string {
  const n = Math.abs(value);
  if (n >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

function shortLabel(label: string): string {
  const part = label.split("/")[0] ?? label;
  return part.length > 5 ? part.slice(0, 3) : part;
}

function ChartCard({
  title,
  hint,
  children,
  empty,
  emptyText = "Sem dados suficientes para o gráfico.",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {empty ? <Text style={styles.empty}>{emptyText}</Text> : children}
    </View>
  );
}

function ChartFrame({
  height,
  children,
}: {
  height: number;
  children: (chartWidth: number) => ReactNode;
}) {
  const [innerW, setInnerW] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== innerW) setInnerW(w);
  }

  const chartWidth = Math.max(120, innerW - Y_AXIS_W - CHART_PAD);

  return (
    <View
      style={[styles.frame, { minHeight: height + X_LABEL_H }]}
      onLayout={onLayout}
    >
      {innerW > 0 ? children(chartWidth) : null}
    </View>
  );
}

function LegendRow({
  items,
}: {
  items: { color: string; label: string }[];
}) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.legendText} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ChartFallback({ rows }: { rows: { label: string; text: string }[] }) {
  return (
    <View style={styles.fallback}>
      {rows.slice(0, 8).map((r) => (
        <View key={r.label} style={styles.fallbackRow}>
          <Text style={styles.fallbackLabel}>{r.label}</Text>
          <Text style={styles.fallbackValue}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

const stylesAxis = {
  color: colors.muted,
  fontSize: 10,
  fontFamily: fonts.sans,
};

const axisProps = {
  rulesColor: colors.border,
  xAxisColor: colors.border,
  yAxisColor: colors.border,
  yAxisTextStyle: stylesAxis,
  xAxisLabelTextStyle: stylesAxis,
  yAxisLabelWidth: Y_AXIS_W,
  labelsExtraHeight: X_LABEL_H,
  overflowTop: 12,
  overflowBottom: 0,
  initialSpacing: 8,
  endSpacing: 12,
};

export function MoneyBarChart({
  title,
  hint,
  data,
  height = 200,
}: {
  title: string;
  hint?: string;
  data: MoneyBarPoint[];
  height?: number;
}) {
  const empty = data.length === 0 || data.every((d) => d.value === 0);
  const n = Math.max(data.length, 1);
  const gifted = getGifted();

  return (
    <ChartCard title={title} hint={hint} empty={empty}>
      {!gifted ? (
        <ChartFallback
          rows={data.map((d) => ({
            label: d.label,
            text: formatCompactBrl(d.value),
          }))}
        />
      ) : (
        <ChartFrame height={height}>
          {(chartWidth) => {
            const BarChart = gifted.BarChart;
            const barWidth = Math.min(14, Math.max(8, chartWidth / (n * 2.2)));
            const spacing = Math.max(
              6,
              (chartWidth - barWidth * n) / Math.max(n, 1),
            );
            return (
              <BarChart
                data={data.map((d) => ({
                  value: Math.abs(d.value),
                  label: shortLabel(d.label),
                  frontColor:
                    d.frontColor ??
                    (d.value >= 0 ? CHART.income : CHART.expense),
                }))}
                width={chartWidth}
                height={height}
                barWidth={barWidth}
                spacing={spacing}
                roundedTop
                hideRules={false}
                formatYLabel={(v: string) => formatCompactBrl(Number(v))}
                noOfSections={4}
                disableScroll
                isAnimated={false}
                {...axisProps}
              />
            );
          }}
        </ChartFrame>
      )}
    </ChartCard>
  );
}

export function MoneyGroupedBarChart({
  title,
  hint,
  data,
  aName = "Entradas",
  bName = "Saídas",
  height = 220,
}: {
  title: string;
  hint?: string;
  data: MoneyGroupedBar[];
  aName?: string;
  bName?: string;
  height?: number;
}) {
  const empty = data.length === 0;
  const groups = Math.max(data.length, 1);
  const gifted = getGifted();

  return (
    <ChartCard title={title} hint={hint} empty={empty}>
      <LegendRow
        items={[
          { color: CHART.income, label: aName },
          { color: CHART.expense, label: bName },
        ]}
      />
      {!gifted ? (
        <ChartFallback
          rows={data.map((d) => ({
            label: d.label,
            text: `${formatCompactBrl(d.a)} / ${formatCompactBrl(d.b)}`,
          }))}
        />
      ) : (
        <ChartFrame height={height}>
          {(chartWidth) => {
            const BarChart = gifted.BarChart;
            const pairW = 22;
            const spacing = Math.max(
              8,
              (chartWidth - pairW * groups) / Math.max(groups, 1),
            );
            const barData = data.flatMap((d) => [
              {
                value: Math.max(0, d.a),
                label: shortLabel(d.label),
                frontColor: CHART.income,
                spacing: 2,
              },
              {
                value: Math.max(0, d.b),
                frontColor: CHART.expense,
                spacing,
              },
            ]);
            return (
              <BarChart
                data={barData}
                width={chartWidth}
                height={height}
                barWidth={10}
                roundedTop
                hideRules={false}
                formatYLabel={(v: string) => formatCompactBrl(Number(v))}
                noOfSections={4}
                disableScroll
                isAnimated={false}
                {...axisProps}
              />
            );
          }}
        </ChartFrame>
      )}
    </ChartCard>
  );
}

export function MoneyStackedBarChart({
  title,
  hint,
  series,
  rows,
  height = 220,
}: {
  title: string;
  hint?: string;
  series: StackSeries[];
  rows: StackRow[];
  height?: number;
}) {
  const empty =
    rows.length === 0 ||
    rows.every((r) => series.every((s) => (r.values[s.key] ?? 0) === 0));
  const n = Math.max(rows.length, 1);
  const gifted = getGifted();

  return (
    <ChartCard title={title} hint={hint} empty={empty}>
      <LegendRow items={series.map((s) => ({ color: s.color, label: s.name }))} />
      {!gifted ? (
        <ChartFallback
          rows={rows.map((r) => ({
            label: r.label,
            text: series
              .map((s) => formatCompactBrl(r.values[s.key] ?? 0))
              .join(" · "),
          }))}
        />
      ) : (
        <ChartFrame height={height}>
          {(chartWidth) => {
            const BarChart = gifted.BarChart;
            const barWidth = Math.min(14, Math.max(8, chartWidth / (n * 2.2)));
            const spacing = Math.max(
              6,
              (chartWidth - barWidth * n) / Math.max(n, 1),
            );
            const stackData = rows.map((row) => ({
              label: shortLabel(row.label),
              stacks: series.map((s, si) => ({
                value: Math.max(0, row.values[s.key] ?? 0),
                color: s.color,
                borderTopLeftRadius: si === series.length - 1 ? 4 : 0,
                borderTopRightRadius: si === series.length - 1 ? 4 : 0,
              })),
            }));
            return (
              <BarChart
                stackData={stackData}
                width={chartWidth}
                height={height}
                barWidth={barWidth}
                spacing={spacing}
                hideRules={false}
                formatYLabel={(v: string) => formatCompactBrl(Number(v))}
                noOfSections={4}
                disableScroll
                isAnimated={false}
                {...axisProps}
              />
            );
          }}
        </ChartFrame>
      )}
    </ChartCard>
  );
}

export function MoneyLineChart({
  title,
  hint,
  series,
  height = 200,
  ySuffix = "",
  emptyText,
}: {
  title: string;
  hint?: string;
  series: { name: string; data: MoneyLinePoint[]; color?: string }[];
  height?: number;
  ySuffix?: string;
  emptyText?: string;
}) {
  const primary = series[0];
  const empty = !primary || primary.data.length < 2;
  const palette = [
    CHART.brand,
    CHART.expense,
    CHART.income,
    CHART.invest,
    CHART.insight,
  ];
  const n = primary?.data.length ?? 0;
  const gifted = getGifted();

  return (
    <ChartCard title={title} hint={hint} empty={empty} emptyText={emptyText}>
      <LegendRow
        items={series.map((s, i) => ({
          color: s.color ?? palette[i % palette.length]!,
          label: s.name,
        }))}
      />
      {!gifted || !primary ? (
        <ChartFallback
          rows={(primary?.data ?? []).map((d) => ({
            label: d.label,
            text: `${formatCompactBrl(d.value)}${ySuffix}`,
          }))}
        />
      ) : (
        <ChartFrame height={height}>
          {(chartWidth) => {
            const LineChart = gifted.LineChart;
            const initialSpacing = 10;
            const endSpacing = 16;
            const usable = Math.max(80, chartWidth - initialSpacing - endSpacing);
            const spacing =
              n <= 1 ? usable : Math.max(12, usable / Math.max(n - 1, 1));

            const align = (s?: { data: MoneyLinePoint[] }) =>
              primary.data.map((_, i) => ({
                value: s?.data[i]?.value ?? 0,
              }));

            return (
              <LineChart
                data={primary.data.map((d) => ({
                  value: d.value,
                  label: shortLabel(d.label),
                }))}
                data2={series[1] ? align(series[1]) : undefined}
                data3={series[2] ? align(series[2]) : undefined}
                data4={series[3] ? align(series[3]) : undefined}
                data5={series[4] ? align(series[4]) : undefined}
                width={chartWidth}
                height={height}
                spacing={spacing}
                initialSpacing={initialSpacing}
                endSpacing={endSpacing}
                color={primary.color ?? palette[0]}
                color2={series[1]?.color ?? palette[1]}
                color3={series[2]?.color ?? palette[2]}
                color4={series[3]?.color ?? palette[3]}
                color5={series[4]?.color ?? palette[4]}
                thickness={2.5}
                thickness2={2.2}
                thickness3={2.2}
                thickness4={2}
                thickness5={2}
                hideDataPoints={n > 12}
                hideDataPoints2
                hideDataPoints3
                hideDataPoints4
                hideDataPoints5
                dataPointsRadius={3}
                dataPointsColor={primary.color ?? palette[0]}
                curved
                curvature={0.15}
                rulesColor={colors.border}
                xAxisColor={colors.border}
                yAxisColor={colors.border}
                yAxisTextStyle={stylesAxis}
                xAxisLabelTextStyle={stylesAxis}
                yAxisLabelWidth={Y_AXIS_W}
                labelsExtraHeight={X_LABEL_H}
                overflowTop={16}
                overflowBottom={4}
                formatYLabel={(v: string) =>
                  `${formatCompactBrl(Number(v))}${ySuffix}`
                }
                noOfSections={4}
                disableScroll
                isAnimated={false}
                animateOnDataChange={false}
              />
            );
          }}
        </ChartFrame>
      )}
    </ChartCard>
  );
}

export function piePalette(index: number): string {
  return CHART.cats[index % CHART.cats.length]!;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  frame: {
    width: "100%",
    overflow: "visible",
  },
  title: {
    color: colors.fg,
    fontSize: 16,
    fontFamily: fonts.sansBold,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.sans,
    marginBottom: 4,
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.sans,
    paddingVertical: 28,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "48%",
  },
  legendText: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.sans,
    flexShrink: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  fallback: { gap: 6, paddingVertical: 4 },
  fallbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  fallbackLabel: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.sans,
    flex: 1,
  },
  fallbackValue: {
    color: colors.fg,
    fontSize: 12,
    fontFamily: fonts.sansBold,
  },
});
