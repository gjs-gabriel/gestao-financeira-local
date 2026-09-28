/**
 * Gestão Financeira — visão 360° local-first com cofre criptografado `.gfin`.
 *
 * ## Rodar localmente
 *
 * ```bash
 * npm install
 * npm run dev
 * ```
 *
 * Abre em [http://127.0.0.1:43127](http://127.0.0.1:43127) (porta menos comum).
 *
 * ```bash
 * npm run build && npm start
 * npm run test:domain
 * ```
 *
 * ## Uso rápido
 *
 * 1. Crie um PIN (mín. 4 dígitos) na primeira visita.
 * 2. Cadastre rendas, aplicações, gastos, dívidas e metas.
 * 3. Veja **Fluxo** (`/fluxo`) — caixa mensal e anual.
 * 4. Em **Importar** (`/importar`), envie CSV/Excel do banco (só no navegador).
 * 5. No **Cofre**, use **Baixar cofre** para exportar o arquivo `.gfin`.
 *
 * ## Instituição / banco

Rendas, aplicações e gastos podem ter uma instituição (Nubank, Inter, Swile, etc.). A lista seed fica em `src/domain/institutions.ts`. Use **Outro** para nome livre. O painel filtra aplicações por instituição.

## Importar extrato bancário
 *
 * 1. Baixe o extrato no internet banking (CSV ou XLSX).
 * 2. Abra **Importar** → escolha o arquivo.
 * 3. Confirme o mapeamento das colunas (Data, Descrição, Valor ou Débito/Crédito).
 * 4. Na pré-visualização, ajuste tipo (gasto/renda), categoria e o que incluir.
 * 5. Confirme — grava no cofre cifrado. Duplicatas (data + valor + descrição) são puladas.
 *
 * O parse roda 100% no cliente (`papaparse` + `xlsx`). Nada é enviado a servidor.
 * Créditos viram rendas pontuais (`oneTimeIncomes`); débitos, gastos pontuais.
 *
 * ## Migrar entre dispositivos
 *
 * 1. Em A: Cofre → **Baixar cofre** (guarde o PIN).
 * 2. Copie o `.gfin` para o dispositivo B.
 * 3. Em B: Cofre → **Importar .gfin** → digite o mesmo PIN → confirme a substituição.
 *
 * O envelope `.gfin` é versionado (`format: "gfin"`, `version: 1`). AES-GCM com chave
 * derivada do PIN via PBKDF2 (310 000 iterações, SHA-256). O cache diário fica no
 * IndexedDB do navegador; na web o download é explícito (limitação do browser).
 *
 * ## Arquitetura (preparada para app futuro)
 *
 * | Camada | Pasta | Papel |
 * | --- | --- | --- |
 * | Domínio | `src/domain/` | Entidades, fluxo mensal/anual, import DTO, snapshot. **Sem** React/DOM/IndexedDB. |
 * | Adapters web | `src/adapters/` | Web Crypto, IndexedDB, `.gfin`, parse CSV/XLSX. |
 * | UI | `src/app/`, `src/components/` | Next.js + shadcn + Recharts (só visual). |
 *
 * No app iOS/Android futuro, reutilize o domínio e o mesmo arquivo `.gfin`; troque só
 * os adapters (Keychain/FS) e a UI nativa.
 *
 * Valores monetários: número decimal em BRL. Datas: ISO 8601.
 *
 * Fora do escopo: Open Banking, sync na nuvem.
 */
