import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outName = process.argv[2];
const srcJson = process.argv[3];

if (!outName || !srcJson) {
  console.error("Usage: node scripts/save-cdp-print.mjs <out.png> <cdp-response.json>");
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(srcJson, "utf8"));
const data = j.result?.data ?? j.data;
if (!data) {
  console.error("No screenshot data in", srcJson);
  process.exit(1);
}
const out = path.join(root, "docs", "prints", outName);
fs.writeFileSync(out, Buffer.from(data, "base64"));
console.log("OK", out, Buffer.from(data, "base64").length);
