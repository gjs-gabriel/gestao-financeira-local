import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";

type Props = { children: ReactNode };
type State = { error: Error | null; info: string };

/** Mostra o erro na tela em vez de tela vermelha opaca — ajuda a depurar no device. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[GF_BOUNDARY]", error?.message, error?.stack, info.componentStack);
    this.setState({ info: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Erro no app</Text>
        <Text style={styles.msg}>{this.state.error.message}</Text>
        <ScrollView style={styles.scroll}>
          <Text style={styles.stack}>
            {this.state.error.stack}
            {"\n"}
            {this.state.info}
          </Text>
        </ScrollView>
        <Pressable
          style={styles.btn}
          onPress={() => this.setState({ error: null, info: "" })}
        >
          <Text style={styles.btnText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    paddingTop: 56,
    gap: 12,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.danger,
  },
  msg: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.fg,
  },
  scroll: { flex: 1 },
  stack: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
  },
  btn: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    color: "#f4faf7",
    fontFamily: fonts.sansBold,
    fontSize: 15,
  },
});
