import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import type { CryptoProgress } from "../adapters/crypto";
import { colors, fonts } from "../theme";

const STAGE_LABEL: Record<CryptoProgress, string> = {
  idle: "Preparando…",
  preparing: "Lendo o cofre…",
  deriving_key: "Derivando a chave (PBKDF2)…",
  cipher: "Descriptografando…",
  done: "Pronto",
};

export function UnlockOverlay({
  visible,
  stage,
  profileName,
}: {
  visible: boolean;
  stage: CryptoProgress;
  profileName?: string;
}) {
  if (!visible) return null;

  const steps: CryptoProgress[] = [
    "preparing",
    "deriving_key",
    "cipher",
    "done",
  ];
  const activeIdx = Math.max(0, steps.indexOf(stage === "idle" ? "preparing" : stage));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>Gestão Financeira</Text>
          <Text style={styles.title}>Abrindo cofre…</Text>
          {profileName ? (
            <Text style={styles.sub}>{profileName}</Text>
          ) : null}
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginVertical: 20 }}
          />
          <Text style={styles.stage}>{STAGE_LABEL[stage]}</Text>
          <View style={styles.track}>
            {steps.map((s, i) => (
              <View
                key={s}
                style={[
                  styles.seg,
                  i <= activeIdx ? styles.segOn : null,
                ]}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            O PIN nunca sai deste aparelho. Aguarde o processamento local.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,41,36,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginBottom: 10,
  },
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.accent,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.fg,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
  stage: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.fg,
    textAlign: "center",
  },
  track: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
    width: "100%",
  },
  seg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentSoft,
  },
  segOn: {
    backgroundColor: colors.accent,
  },
  hint: {
    marginTop: 16,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    textAlign: "center",
  },
});
