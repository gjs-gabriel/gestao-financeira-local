import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { GfinEnvelope } from "@gf/core";
import { parseEnvelope } from "./crypto";
import { slugifyProfileName } from "./profiles";

export async function downloadGfin(
  envelope: GfinEnvelope,
  profileName: string,
): Promise<void> {
  const name = `${slugifyProfileName(profileName)}.gfin`;
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) throw new Error("Armazenamento local indisponível.");
  const path = `${base}${name}`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(envelope, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "application/json",
      dialogTitle: "Exportar cofre .gfin",
      UTI: "public.json",
    });
  } else {
    throw new Error("Compartilhamento indisponível neste dispositivo.");
  }
}

export async function pickAndReadGfin(): Promise<GfinEnvelope> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "application/octet-stream", "*/*"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) {
    throw new Error("Nenhum arquivo selecionado.");
  }
  const asset = result.assets[0];
  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Arquivo .gfin inválido (JSON).");
  }
  return parseEnvelope(raw);
}
