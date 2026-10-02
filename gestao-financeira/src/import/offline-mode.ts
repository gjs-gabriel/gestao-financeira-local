/**
 * Modo TOTALMENTE OFFLINE durante importação:
 * bloqueia chamadas a runtime de IA / rede externa no fluxo de import.
 */

let offlineImport = false;

export function setImportOfflineMode(enabled: boolean): void {
  offlineImport = enabled;
}

export function isImportOfflineMode(): boolean {
  return offlineImport;
}

/** Use antes de qualquer chamada de IA no wizard. */
export function assertImportMayUseLocalAi(): void {
  if (offlineImport) {
    throw new Error(
      "Modo TOTALMENTE OFFLINE ativo: a importação não usa IA nem rede.",
    );
  }
}
