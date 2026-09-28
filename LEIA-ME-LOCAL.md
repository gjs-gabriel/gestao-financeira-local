# Gestão Financeira — uso local (Windows)

Pacote do app web local-first (cofre `.gfin`, sem nuvem).

## 1. Extrair

1. Baixe `gestao-financeira-local.zip`.
2. Extraia para `D:\Gestão Financeira` (crie a pasta se precisar).
3. Abra a pasta `gestao-financeira` que ficou dentro do zip (é o código-fonte).

## 2. Requisitos

- **Node.js 18+** (recomendado 20 ou 22): https://nodejs.org/
- Confirme no PowerShell: `node -v` e `npm -v`

## 3. Instalar e rodar

No PowerShell:

```powershell
cd "D:\Gestão Financeira\gestao-financeira"
npm install
npm run dev
```

Abra no navegador o endereço que o terminal mostrar (por padrão algo como **http://127.0.0.1:43127**).

## 4. Uso rápido

1. Crie um PIN (mín. 4 dígitos) na primeira visita.
2. Cadastre rendas, aplicações, gastos; use **Fluxo** e **Importar** (CSV/Excel do banco).
3. Em **Cofre**, use **Baixar cofre** para exportar o arquivo `.gfin` (backup / outro PC).

## Conteúdo deste zip

- Código-fonte completo (sem `node_modules` / `.next`)
- `docs/gestao-financeira-mvp.md` — plano do MVP
- `media/` — capturas de tela de demonstração
- Este `LEIA-ME-LOCAL.md`

Não é necessário Open Banking nem conta na nuvem: tudo fica no navegador + arquivo `.gfin`.
