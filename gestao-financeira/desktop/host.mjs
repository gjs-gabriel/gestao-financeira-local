/**
 * Stub Tauri — processo host mínimo em Node (sem Rust).
 * Abre splash e orquestra como o VBS, útil para testar o fluxo “exe”.
 * Quando Rust estiver disponível, substituir por src-tauri.
 */

import {
  GestaoFinanceiraOrchestrator,
  resolveInstallRoot,
} from "../launcher/src/orchestrator.mjs";

const root = process.env.GF_ROOT || resolveInstallRoot();
const orch = new GestaoFinanceiraOrchestrator({ rootDir: root });
await orch.run();
