import "react-native-gesture-handler";

// Polyfill crypto nativo o mais cedo possível (dev build / JSI).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const qc = require("react-native-quick-crypto") as { install?: () => void };
  qc?.install?.();
} catch {
  /* Expo Go: fallback JS em crypto.native.ts */
}

import {
  Fraunces_800ExtraBold,
  Fraunces_900Black,
  useFonts as useFraunces,
} from "@expo-google-fonts/fraunces";
import {
  Outfit_500Medium,
  Outfit_700Bold,
  useFonts as useOutfit,
} from "@expo-google-fonts/outfit";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "../src/components/AppErrorBoundary";
import { VaultProvider } from "../src/vault/VaultProvider";
import { colors } from "../src/theme";

type GlobalErrorUtils = {
  getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler?: (
    handler: (error: Error, isFatal?: boolean) => void,
  ) => void;
};

export default function RootLayout() {
  useEffect(() => {
    const eu = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
    if (!eu?.setGlobalHandler) return;
    const prev = eu.getGlobalHandler?.();
    eu.setGlobalHandler((error, isFatal) => {
      console.error(
        "[GF_FATAL]",
        error?.message,
        "\n",
        error?.stack,
        "\nfatal=",
        isFatal,
      );
      prev?.(error, isFatal);
    });
  }, []);

  const [outfitLoaded] = useOutfit({
    Outfit_500Medium,
    Outfit_700Bold,
  });
  const [frauncesLoaded] = useFraunces({
    Fraunces_800ExtraBold,
    Fraunces_900Black,
  });

  if (!outfitLoaded || !frauncesLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <VaultProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.fg,
                  contentStyle: { backgroundColor: colors.bg },
                  headerShadowVisible: false,
                  headerTitleStyle: { fontFamily: "Outfit_700Bold" },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
              </Stack>
            </VaultProvider>
          </View>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
