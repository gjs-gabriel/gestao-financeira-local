import { Dimensions, Platform } from "react-native";

/** Ajustes leves para iPhone 17 Pro (tela estreita alta) e mid-range Android. */
export function deviceHints() {
  const { width, height } = Dimensions.get("window");
  const isIos = Platform.OS === "ios";
  const tallPhone = height / Math.max(width, 1) > 2;
  const midRangeAndroid = Platform.OS === "android" && width <= 412;
  return {
    isIos,
    /** Dynamic Island / notch — use SafeAreaView nas telas críticas. */
    preferLargeSafeTop: isIos && tallPhone,
    /** Listas virtuais / menos animações no Moto G60-class. */
    preferLightLists: midRangeAndroid,
    contentMaxWidth: Math.min(width, 480),
  };
}
