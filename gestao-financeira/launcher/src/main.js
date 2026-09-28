#!/usr/bin/env node
/**
 * Entrada do launcher — uso:
 *   node launcher/src/main.js
 *   npm run launch
 */

import {
  GestaoFinanceiraOrchestrator,
  resolveInstallRoot,
} from "./orchestrator.mjs";

const root = resolveInstallRoot();
const orch = new GestaoFinanceiraOrchestrator({ rootDir: root });
await orch.run();
