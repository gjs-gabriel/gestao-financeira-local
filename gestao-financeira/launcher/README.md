# Gestão Financeira — Launcher Windows

## O que o usuário final vê

1. Atalho **Gestão Financeira**
2. Tela **Inicializando…** (Aplicativo / Assistente local / Segurança)
3. O navegador abre o app em `127.0.0.1` automaticamente

Sem terminal, sem `npm`, sem configurar portas.

## Desenvolvimento

```bash
# Inicia splash + Next (produção ou next start) + AI runtime
npm run launch
```

Verbose:

```bash
set GF_LAUNCHER_VERBOSE=1
npm run launch
```

## Pacote de distribuição

```bash
npm run build
npm run package:windows
```

Saída:

```
dist/GestaoFinanceira/
  GestaoFinanceira.vbs   ← clique duplo (sem console)
  GestaoFinanceira.cmd
  criar-atalho.ps1
  start.mjs
  app/                   ← Next.js standalone
  runtime/ai-runtime/    ← Local AI Runtime
  config/launcher.json
  logs/
  data/
```

Na pasta do pacote:

```powershell
.\\criar-atalho.ps1
```

## Executável nativo (.exe)

Rust/Tauri **ainda não está instalado** nesta máquina. A estrutura Tauri fica em `desktop/` para gerar `GestãoFinanceira.exe` quando o toolchain estiver disponível:

```bash
# Uma vez: https://rustup.rs + WebView2
npm run desktop:init   # se necessário
npm run desktop:build
```

Enquanto isso, `GestaoFinanceira.vbs` + Node LTS oferececem o fluxo completo do usuário.

## Princípios

- Bind somente em `127.0.0.1`
- Logs sem dados financeiros
- Assistente local opcional: se Ollama/runtime falhar, o app ainda abre
- Encerrar o launcher encerra os processos filhos
