# Desktop (Tauri) — GestãoFinanceira.exe

Este diretório prepara o executável nativo Windows.

## Status

O launcher funcional **já existe** em `../launcher` (Node + splash + VBS).

Tauri gera `GestãoFinanceira.exe` quando o toolchain estiver instalado:

1. [rustup](https://rustup.rs) (MSVC)
2. WebView2 Runtime (já vem no Windows 10/11 recentes)
3. Visual Studio Build Tools (C++)

## Depois de instalar Rust

```bash
cd gestao-financeira
npm run build
npm run package:windows
npm create tauri-app@latest desktop -- --template vanilla --manager npm --yes
# ou, com o projeto já scaffoldado:
npm run desktop:build
```

O app Tauri deve apenas:

- mostrar a splash (HTML embutido);
- spawnar `node start.mjs` do pacote `dist/GestaoFinanceira`;
- monitorar saúde;
- encerrar filhos ao fechar.

Até lá, use:

```
dist/GestaoFinanceira/GestaoFinanceira.vbs
```

ou:

```
npm run launch
```
