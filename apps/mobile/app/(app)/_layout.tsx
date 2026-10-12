import { Redirect, Tabs } from "expo-router";
import { AlertsHeaderButton } from "../../src/components/AlertsHeaderButton";
import { AppErrorBoundary } from "../../src/components/AppErrorBoundary";
import { BottomTabBar } from "../../src/components/BottomTabBar";
import { colors, fonts } from "../../src/theme";
import { useVault } from "../../src/vault/VaultProvider";

export default function AppLayout() {
  const vault = useVault();

  if (vault.status !== "unlocked") {
    return <Redirect href="/" />;
  }

  return (
    <AppErrorBoundary>
    <Tabs
      initialRouteName="mais"
      tabBar={(props) => <BottomTabBar state={props.state} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.fg,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fonts.sansBold, fontSize: 17 },
        headerRight: () => <AlertsHeaderButton />,
        sceneStyle: { backgroundColor: colors.bg },
        lazy: true,
      }}
    >
      <Tabs.Screen name="mais" options={{ title: "Mais" }} />
      <Tabs.Screen name="simulacao-compra" options={{ title: "Simular compra" }} />
      <Tabs.Screen name="fluxo" options={{ title: "Fluxo" }} />
      <Tabs.Screen name="patrimonio" options={{ title: "Patrimônio" }} />
      <Tabs.Screen name="relatorios" options={{ title: "Relatórios" }} />

      <Tabs.Screen name="index" options={{ href: null, title: "Painel" }} />
      <Tabs.Screen name="menu" options={{ href: null, title: "Menu" }} />
      <Tabs.Screen
        name="alertas"
        options={{ href: null, title: "Alertas", headerRight: () => null }}
      />
      <Tabs.Screen name="contas" options={{ href: null, title: "Contas" }} />
      <Tabs.Screen name="cartoes" options={{ href: null, title: "Cartões" }} />
      <Tabs.Screen
        name="transferencias"
        options={{ href: null, title: "Transferências" }}
      />
      <Tabs.Screen name="rendas" options={{ href: null, title: "Rendas" }} />
      <Tabs.Screen name="gastos" options={{ href: null, title: "Gastos" }} />
      <Tabs.Screen
        name="assinaturas"
        options={{ href: null, title: "Assinaturas" }}
      />
      <Tabs.Screen
        name="orcamentos"
        options={{ href: null, title: "Orçamentos" }}
      />
      <Tabs.Screen
        name="aplicacoes"
        options={{ href: null, title: "Aplicações" }}
      />
      <Tabs.Screen name="dividas" options={{ href: null, title: "Dívidas" }} />
      <Tabs.Screen name="metas" options={{ href: null, title: "Metas" }} />
      <Tabs.Screen name="finn" options={{ href: null, title: "Finn" }} />
      <Tabs.Screen name="analista" options={{ href: null, title: "Analista" }} />
      <Tabs.Screen
        name="inteligencia"
        options={{ href: null, title: "Inteligência" }}
      />
      <Tabs.Screen name="importar" options={{ href: null, title: "Importar" }} />
      <Tabs.Screen
        name="categorias"
        options={{ href: null, title: "Categorias" }}
      />
      <Tabs.Screen
        name="ia"
        options={{ href: null, title: "Assistente local" }}
      />
      <Tabs.Screen name="cofre" options={{ href: null, title: "Cofre" }} />
    </Tabs>
    </AppErrorBoundary>
  );
}
