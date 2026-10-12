/** Identidade light “Forest teal / Private Wealth” — alinhada à web. */
export const colors = {
  /** Fundo de tela / navegação (mesmo tom em todo o app). */
  bg: "#f4faf7",
  /** Superfície de card — levemente elevada, mesma família do fundo. */
  bgCard: "#ffffff",
  bgElevated: "#ffffff",
  fg: "#0f2924",
  muted: "#5a736c",
  primary: "#0f2924",
  accent: "#1a5c4a",
  accentSoft: "#ccebe0",
  income: "#2d9b6f",
  expense: "#c9892a",
  investment: "#3b6fd9",
  warn: "#c9892a",
  danger: "#c94a3a",
  insight: "#3aa0b8",
  border: "rgba(15,41,36,0.10)",
  input: "#ffffff",
  /** Barra inferior no mesmo fundo da tela (sem “faixa branca”). */
  tabBar: "#f4faf7",
  tabInactive: "#7a9189",
  chartBrand: "#2a6b5a",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const fonts = {
  sans: "Outfit_500Medium",
  sansBold: "Outfit_700Bold",
  heading: "Fraunces_800ExtraBold",
  display: "Fraunces_900Black",
};

/** Cores do React Navigation — mesmo mint do app (evita fundo cinza padrão). */
export const navigationColors = {
  primary: colors.accent,
  background: colors.bg,
  card: colors.bg,
  text: colors.fg,
  border: colors.border,
  notification: colors.danger,
};
