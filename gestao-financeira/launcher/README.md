# Gestão Financeira — Launcher Windows

## O que o usuário final vê

1. Duplo clique em **Instalar.exe** — instala Node.js (com npm), Ollama e o modelo `qwen2.5:1.5b`
2. Duplo clique em **GestaoFinanceira.exe** (ou no atalho **Gestão Financeira**)
3. Tela **Inicializando…** (Aplicativo / Assistente local / Segurança)
4. O navegador abre o app em `127.0.0.1` e a IA já foi inicializada

Sem terminal e sem digitar comandos.

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
  Instalar.exe           ← duplo clique: Node.js (npm), Ollama e o modelo
  GestaoFinanceira.exe   ← duplo clique: abre o app e inicializa a IA
  start.mjs
  app/                   ← Next.js standalone
  runtime/ai-runtime/    ← Local AI Runtime
  config/launcher.json
  logs/
  data/
```

Na pasta do projeto, os mesmos executáveis ficam em `Instalar.exe` e `GestaoFinanceira.exe`.

## Executáveis

`Instalar.exe` e `GestaoFinanceira.exe` são gerados com o compilador do .NET Framework (sem Rust). O primeiro instala as ferramentas. O segundo sobe o aplicativo e a IA.

## Princípios

- Bind somente em `127.0.0.1`
- Logs sem dados financeiros
- Assistente local: o executável sobe o Ollama (se ainda não estiver no ar) e o AI runtime; se falhar, o app ainda abre
- Encerrar o launcher encerra os processos filhos (Next e AI runtime). O serviço do Ollama permanece
