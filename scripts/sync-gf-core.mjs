/**
 * Re-copia domain/security/finance do desktop para packages/gf-core.
 * Não altera o app desktop.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcApp = path.join(root, "gestao-financeira", "src");
const dest = path.join(root, "packages", "gf-core", "src");

function copyTsDir(from, to, { skipTest = true, skip = [] } = {}) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (skip.includes(name)) continue;
    const sp = path.join(from, name);
    const dp = path.join(to, name);
    const st = fs.statSync(sp);
    if (st.isDirectory()) {
      copyTsDir(sp, dp, { skipTest, skip: [] });
      continue;
    }
    if (!name.endsWith(".ts")) continue;
    if (skipTest && name.endsWith(".test.ts")) continue;
    fs.copyFileSync(sp, dp);
  }
}

function rewriteFile(file) {
  let c = fs.readFileSync(file, "utf8");
  const map = [
    [/@\/domain\/cashflow/g, "../domain/cashflow"],
    [/@\/domain\/labels/g, "../domain/labels"],
    [/@\/domain\/planning/g, "../domain/planning"],
    [/@\/domain\/wealth/g, "../domain/wealth"],
    [/@\/domain\/types/g, "../domain/types"],
    [/@\/domain\/calculations/g, "../domain/calculations"],
    [/@\/domain\/budgets/g, "../domain/budgets"],
    [/@\/domain\/alerts/g, "../domain/alerts"],
    [/@\/domain\/insights/g, "../domain/insights"],
    [/@\/domain\/intelligence/g, "../domain/intelligence"],
    [/@\/domain\/marina-demo/g, "../domain/marina-demo"],
    [/@\/domain/g, "../domain/index"],
    [/@\/security\/gfin-guard/g, "../security/gfin-guard"],
    [/@\/security\/gfin-validate/g, "../security/gfin-validate"],
    [/@\/security/g, "../security/index"],
    [/@\/infra\/pluggy\/types/g, "../infra/pluggy/types"],
  ];
  for (const [re, rep] of map) c = c.replace(re, rep);
  if (file.includes(`${path.sep}domain${path.sep}mappers${path.sep}`)) {
    c = c.replace(
      /from ["']\.\.\/security\/gfin-guard["']/g,
      'from "../../security/gfin-guard"',
    );
    c = c.replace(
      /from ["']\.\.\/infra\/pluggy\/types["']/g,
      'from "../../infra/pluggy/types"',
    );
  }
  fs.writeFileSync(file, c, "utf8");
}

fs.rmSync(path.join(dest, "domain"), { recursive: true, force: true });
fs.rmSync(path.join(dest, "security"), { recursive: true, force: true });
fs.rmSync(path.join(dest, "finance"), { recursive: true, force: true });
fs.rmSync(path.join(dest, "infra"), { recursive: true, force: true });

copyTsDir(path.join(srcApp, "domain"), path.join(dest, "domain"));
copyTsDir(path.join(srcApp, "security"), path.join(dest, "security"), {
  skip: ["pluggy-proxy-gate.ts", "security.test.ts"],
});
copyTsDir(path.join(srcApp, "ai", "finance"), path.join(dest, "finance"));
fs.mkdirSync(path.join(dest, "infra", "pluggy"), { recursive: true });
fs.copyFileSync(
  path.join(srcApp, "infra", "pluggy", "types.ts"),
  path.join(dest, "infra", "pluggy", "types.ts"),
);

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".ts")) rewriteFile(p);
  }
}
walk(dest);

fs.writeFileSync(
  path.join(dest, "security", "index.ts"),
  `export * from "./limits";
export * from "./pin-throttle";
export * from "./pin-guard";
export * from "./vault-session";
export * from "./gfin-validate";
export * from "./gfin-guard";
export * from "./timing-safe";
export * from "./safe-log";
`,
  "utf8",
);

fs.writeFileSync(
  path.join(dest, "finance", "index.ts"),
  `export * from "./types";
export * from "./FinancialSnapshotBuilder";
export * from "./FinancialPrivacySanitizer";
export * from "./FinancialInsightEngine";
export * from "./FinancialAlertEngine";
export * from "./FinancialPatternEngine";
export * from "./FinancialBudgetEngine";
export * from "./FinancialPortfolioEngine";
export * from "./FinancialScenarioEngine";
`,
  "utf8",
);

console.info("[sync-gf-core] OK → packages/gf-core/src");
