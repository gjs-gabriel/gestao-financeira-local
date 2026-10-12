import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";

type TabRoute = { key: string; name: string };

type BottomTabBarProps = {
  state: {
    index: number;
    routes: TabRoute[];
  };
};

const TAB_META: Record<
  string,
  { label: string; icon: string; center?: boolean; href: Href }
> = {
  "simulacao-compra": {
    label: "Simular",
    icon: "🛒",
    href: "/(app)/simulacao-compra",
  },
  fluxo: { label: "Fluxo", icon: "📈", href: "/(app)/fluxo" },
  patrimonio: {
    label: "Patrimônio",
    icon: "◆",
    center: true,
    href: "/(app)/patrimonio",
  },
  relatorios: { label: "Relatórios", icon: "📊", href: "/(app)/relatorios" },
  mais: { label: "Mais", icon: "☰", href: "/(app)/mais" },
};

const VISIBLE = [
  "simulacao-compra",
  "fluxo",
  "patrimonio",
  "relatorios",
  "mais",
] as const;

export function BottomTabBar({ state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = (state?.routes ?? []).filter((r) =>
    (VISIBLE as readonly string[]).includes(r.name),
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {VISIBLE.map((name) => {
        const route = routes.find((r) => r.name === name);
        const meta = TAB_META[name]!;
        if (!route) return <View key={name} style={styles.slot} />;

        const focused =
          state.index ===
          state.routes.findIndex((r) => r.key === route.key);

        if (meta.center) {
          return (
            <Link key={route.key} href={meta.href} asChild>
              <Pressable
                style={styles.centerSlot}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={meta.label}
              >
                <View
                  style={[styles.centerBtn, focused && styles.centerBtnActive]}
                >
                  <Text style={styles.centerIcon}>{meta.icon}</Text>
                </View>
                <Text
                  style={[styles.label, focused && styles.labelActive]}
                  numberOfLines={1}
                >
                  {meta.label}
                </Text>
              </Pressable>
            </Link>
          );
        }

        return (
          <Link key={route.key} href={meta.href} asChild>
            <Pressable
              style={styles.slot}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
            >
              <Text style={[styles.icon, focused && styles.iconActive]}>
                {meta.icon}
              </Text>
              <Text
                style={[styles.label, focused && styles.labelActive]}
                numberOfLines={1}
              >
                {meta.label}
              </Text>
              {focused ? <View style={styles.dot} /> : null}
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: 4,
    shadowColor: "#0f2924",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 48,
    paddingBottom: 4,
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
    marginTop: -22,
    gap: 4,
  },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.accentSoft,
    shadowColor: colors.insight,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  centerBtnActive: {
    backgroundColor: colors.accent,
  },
  centerIcon: { color: "#f4faf7", fontSize: 18, fontFamily: fonts.sansBold },
  icon: { fontSize: 18, opacity: 0.75 },
  iconActive: { opacity: 1 },
  label: {
    fontSize: 10,
    color: colors.tabInactive,
    fontFamily: fonts.sans,
  },
  labelActive: {
    color: colors.fg,
    fontFamily: fonts.sansBold,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
});
