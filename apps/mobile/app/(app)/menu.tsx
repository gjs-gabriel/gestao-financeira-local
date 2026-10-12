import { Redirect } from "expo-router";

/** Compat: Menu antigo redireciona para Mais. */
export default function MenuRedirect() {
  return <Redirect href="/(app)/mais" />;
}
