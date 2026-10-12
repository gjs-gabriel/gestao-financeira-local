import { buildFinancialAlerts, buildFinancialSnapshot } from "@gf/core";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { currentYearMonth } from "../lib/money";
import { colors, fonts } from "../theme";
import { useVault } from "../vault/VaultProvider";

export function AlertsHeaderButton() {
  const router = useRouter();
  const { snapshot } = useVault();
  let count = 0;
  if (snapshot) {
    try {
      const { year, month } = currentYearMonth();
      const fin = buildFinancialSnapshot(snapshot, year, month);
      count = buildFinancialAlerts(fin).length;
    } catch (e) {
      console.warn("[alerts] falha ao contar", e);
    }
  }

  return (
    <Pressable
      onPress={() => router.push("/(app)/alertas")}
      hitSlop={10}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `Alertas, ${count} pendentes` : "Alertas"
      }
    >
      <Text style={styles.icon}>🔔</Text>
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginRight: 12,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: fonts.sansBold,
  },
});
