/**
 * Empacota o Gestão Financeira para distribuição Windows.
 * Saída: dist/GestaoFinanceira/
 *
 * Requer: npm run build (standalone) antes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "GestaoFinanceira");

function mustExist(p, hint) {
  if (!fs.existsSync(p)) {
    throw new Error(`${hint}\nAusente: ${p}`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function compileWindowsExes(root) {
  const csc = path.join(
    process.env.WINDIR || "C:\\Windows",
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  );
  mustExist(csc, "Compilador csc.exe do .NET Framework não encontrado.");
  const jobs = [
    {
      source: path.join(root, "installer", "InstalarApp.cs"),
      manifest: path.join(root, "installer", "Instalar.exe.manifest"),
      output: path.join(root, "Instalar.exe"),
    },
    {
      source: path.join(root, "launcher", "GestaoFinanceiraApp.cs"),
      manifest: path.join(root, "launcher", "GestaoFinanceira.exe.manifest"),
      output: path.join(root, "GestaoFinanceira.exe"),
    },
  ];
  for (const job of jobs) {
    mustExist(job.source, "Fonte do executável ausente.");
    const result = spawnSync(
      csc,
      [
        "/nologo",
        "/target:winexe",
        "/codepage:65001",
        "/optimize+",
        "/r:System.dll",
        "/r:System.Windows.Forms.dll",
        "/r:System.Drawing.dll",
        `/win32manifest:${job.manifest}`,
        `/out:${job.output}`,
        job.source,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(
        `Falha ao compilar ${path.basename(job.output)}\n${result.stdout || ""}${result.stderr || ""}`,
      );
    }
    console.info("[package] exe →", job.output);
  }
}

console.info("[package] Limpando", OUT);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const standalone = path.join(ROOT, ".next", "standalone");
mustExist(
  standalone,
  "Build standalone não encontrado. Rode: npm run build",
);

console.info("[package] Copiando app standalone…");
copyDir(standalone, path.join(OUT, "app"));

// static + public exigidos pelo Next standalone
const staticSrc = path.join(ROOT, ".next", "static");
if (fs.existsSync(staticSrc)) {
  copyDir(staticSrc, path.join(OUT, "app", ".next", "static"));
}
const publicSrc = path.join(ROOT, "public");
if (fs.existsSync(publicSrc)) {
  copyDir(publicSrc, path.join(OUT, "app", "public"));
}

console.info("[package] Runtime de IA…");
copyDir(
  path.join(ROOT, "local-ai-runtime"),
  path.join(OUT, "runtime", "ai-runtime"),
);
// entry esperado pelo launcher.json
write(
  path.join(OUT, "runtime", "ai-runtime", "index.js"),
  `import "./src/index.js";\n`,
);

console.info("[package] Launcher + config…");
copyDir(path.join(ROOT, "launcher", "src"), path.join(OUT, "launcher"));
copyDir(path.join(ROOT, "config"), path.join(OUT, "config"));
fs.mkdirSync(path.join(OUT, "logs"), { recursive: true });
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
fs.mkdirSync(path.join(OUT, "runtime", "models"), { recursive: true });

// Ajuste paths: server.js fica em app/server.js no standalone
const launcherCfg = JSON.parse(
  fs.readFileSync(path.join(OUT, "config", "launcher.json"), "utf8"),
);
launcherCfg.paths.appServer = "app/server.js";
launcherCfg.paths.aiRuntime = "runtime/ai-runtime/index.js";
write(
  path.join(OUT, "config", "launcher.json"),
  JSON.stringify(launcherCfg, null, 2),
);

// Entrada principal do pacote
write(
  path.join(OUT, "start.mjs"),
  `import { GestaoFinanceiraOrchestrator, resolveInstallRoot } from "./launcher/orchestrator.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
process.env.GF_ROOT = root;
const orch = new GestaoFinanceiraOrchestrator({ rootDir: root });
await orch.run();
`,
);

// Atalhos Windows (sem terminal visível)
write(
  path.join(OUT, "GestaoFinanceira.vbs"),
  `' Gestão Financeira — inicia sem janela de terminal
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node"
' Preferir Node portátil se existir
portable = dir & "\\runtime\\node\\node.exe"
If fso.FileExists(portable) Then node = portable
cmd = """" & node & """ """ & dir & "\\start.mjs"""
sh.CurrentDirectory = dir
sh.Run cmd, 0, False
`,
);

write(
  path.join(OUT, "GestaoFinanceira.cmd"),
  `@echo off
cd /d "%~dp0"
if exist "runtime\\node\\node.exe" (
  "runtime\\node\\node.exe" "start.mjs"
) else (
  node "start.mjs"
)
`,
);

write(
  path.join(OUT, "criar-atalho.ps1"),
  `# Cria atalho na área de trabalho: Gestão Financeira
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $dir "GestaoFinanceira.exe"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Gestão Financeira.lnk"
$w = New-Object -ComObject WScript.Shell
$lnk = $w.CreateShortcut($lnkPath)
$lnk.TargetPath = $target
$lnk.WorkingDirectory = $dir
$lnk.WindowStyle = 1
$lnk.Description = "Gestão Financeira"
$lnk.Save()
Write-Host "Atalho criado: $lnkPath"
`,
);

write(
  path.join(OUT, "LEIA-ME.txt"),
  `Gestão Financeira — pacote Windows
=================================

1) Clique duas vezes em Instalar.exe.
   O Windows pede permissão de administrador.
   O instalador coloca, se ainda não existirem:
   - Node.js LTS (inclui node, npm e npx)
   - Ollama
   - Modelo qwen2.5:1.5b
   e cria o atalho "Gestão Financeira" na área de trabalho.

2) Clique duas vezes em GestaoFinanceira.exe (ou no atalho).
   O aplicativo abre e a IA é inicializada.
   Uma tela "Inicializando…" aparece e o navegador abre em 127.0.0.1.

3) Se o assistente local não iniciar, o aplicativo continua.
   Seus dados permanecem neste computador.

Não é necessário abrir terminal nem digitar comandos.
`,
);

compileWindowsExes(ROOT);

for (const name of ["Instalar.exe", "GestaoFinanceira.exe"]) {
  const src = path.join(ROOT, name);
  mustExist(src, "Executável ausente. A compilação deveria ter gerado " + name + ".");
  fs.copyFileSync(src, path.join(OUT, name));
}

console.info("[package] OK →", OUT);
console.info("[package] Próximo: dist/GestaoFinanceira/Instalar.exe");
