# Arquitetura V1.5 — Conta + Transação

Documento de decisão após análise do código atual (`schema` 1–3).
Implementação incremental: domínio primeiro, UI depois.

## Diagnóstico do modelo atual

### O que funciona
- Separação `domain/` × `adapters/` × UI já existe.
- Cofre `.gfin` (envelope v1, PBKDF2 + AES-GCM) estável.
- `parseSnapshot` já migra schema 1→2→3 (instituições, parcelas).
- Fluxo, painel e importação usam funções do domínio (não recalculam na UI).

### Problema estrutural
O domínio é centrado em **listas de gastos/rendas**, não em **contas e movimentos**:

| Entidade atual | Papel | Limitação |
| --- | --- | --- |
| `Income` / `OneTimeIncome` | Entrada | Sem conta; recorrente vs pontual são tipos distintos |
| `RecurringExpense` / `OneTimeExpense` / `InstallmentExpense` | Saída | Gasto é a unidade; parcelas sem cartão/fatura |
| `Investment` | Ativo | Saldo estático; aporte parece “aplicação”, não movimento |
| `Debt` | Passivo | Sem ligação a cartão/fatura |
| `Institution` | Tag | Não agrupa contas; cartão ≠ conta |

**Patrimônio hoje** = `∑ investimentos − ∑ dívidas` — ignora saldos bancários e limite/fatura de cartão.

**Fluxo hoje** mistura templates recorrentes (normalizados) com pontuais por data — correto para “visão do mês”, mas não há ledger nem transferências.

**Importação** grava direto em `oneTimeExpenses` / `oneTimeIncomes` — qualquer TED Nubank→XP vira receita+despesa se importada dos dois lados.

### Dependências UI ↔ domínio
- Páginas em `src/components/pages/*` leem `VaultSnapshot` e chamam `monthlyCashflow`, `upsertEntity`, etc.
- `vault-context` persiste o snapshot inteiro cifrado; adapters não conhecem entidades.
- Risco de migração: abrir `.gfin` antigo após bump de schema; PIN errado já falha em AES-GCM sem vazar plaintext.

## Modelo-alvo (fonte da verdade)

```
Institution (catálogo)
Account (corrente | poupança | carteira | investimento_caixa | outro)
CreditCard (limite, fechamento, vencimento, paymentAccountId)
Transaction
  kind: income | expense | transfer | card_purchase | invoice_payment
        | investment_buy | investment_sell | adjustment
InstallmentPlan → gera obrigações / compras no cartão
CreditCardInvoice (período, status open|closed|paid)
RecurringRule (templates de renda/despesa — não são patrimônio)
InvestmentPosition (ativo; saldo/qty — evolui na V2)
Debt (passivo não-cartão)
Budget / Rule / Alert (V1.5 depois do ledger)
Category, Goal (permanecem)
```

### Regras no domínio (obrigatórias)

1. **Saldo da conta** = saldo inicial + incomes − expenses + transfers_in − transfers_out ± ajustes (ignora `card_purchase` na conta bancária; compra fica no cartão).
2. **Transferência** = 2 pernas ligadas pelo mesmo `transferGroupId`; **não** entra em receita/despesa do fluxo; **não** muda PL.
3. **Compra no cartão** = aumenta fatura/passivo; categoria de gasto no fluxo do mês; **não** reduz conta bancária.
4. **Pagamento de fatura** = `invoice_payment` (conta → quitação da fatura); **não** é nova despesa (a despesa já foi a compra).
5. **Aporte em investimento** = saída da conta + aumento do ativo (ou `investment_buy`); PL inalterado salvo rendimento.
6. **PL** = (saldos de contas + posições de investimento) − (saldos de faturas abertas + dívidas).

## Estratégia de migração `.gfin`

- **Envelope** permanece `version: 1` (crypto). Só sobe se mudar KDF/cipher.
- **Snapshot** `schemaVersion: 4`.
- `parseSnapshot` aceita **1–4**; sempre normaliza para 4.
- Migração **3→4** (efervescente, uma vez):
  1. Criar conta padrão `Conta principal` (tipo `checking`).
  2. Por instituição com movimento relevante, opcionalmente criar conta nomeada (fase 1: uma conta só, para simplicidade).
  3. `oneTimeIncome` → `Transaction` `income`.
  4. `oneTimeExpense` → `Transaction` `expense`.
  5. `InstallmentExpense` → `InstallmentPlan` (pagamento em dinheiro/`account`, não cartão).
  6. `Income` / `RecurringExpense` → `RecurringRule` (templates).
  7. `Investment` → `InvestmentPosition` (+ conta de investimento se fizer sentido depois).
  8. `Debt` / `Goal` / `Category` / `Institution` → copiados.
- **Compatibilidade UI (strangler):** enquanto as telas antigas existirem, `projectLegacy(snapshot)` materializa arrays legados **somente leitura** a partir do ledger+rules, **ou** mantemos arrays legados preenchidos na migração e a UI antiga continua até a Fase 2.  
  **Decisão desta implementação:** na Fase 1 o ledger é adicionado e a migração **preenche** `accounts`/`transactions`/… **sem remover** arrays legados; cálculos novos usam ledger quando houver transações; fluxo/painel atuais continuam no legado até a Fase 2 reescrever as páginas. Assim não há perda de dados nem UI quebrada.

## Fases (execução)

| Fase | Entrega | UI |
| --- | --- | --- |
| **1** | Tipos ledger, migração 4, saldos, PL correto, testes de não-duplicidade | Mínima: página Contas (CRUD) se couber; resto intacto |
| **2** | Dual-write nas telas + Contas + import→Transaction; painel usa `netWorthLedger` | Contas; demais CRUDs sincronizam ledger |
| **3** | Cartões, faturas, transferências, orçamentos, regras, alertas (V1.5) | Novas rotas |
| **4–5** | V2 planejamento / V3 inteligência | Incremental |

### Status Fase 4 (V2)
- Metas inteligentes (`smartGoalInsight`)
- Dívidas com parcela/taxa + simulação de pagamento extra
- `/patrimonio` — ativos, passivos, evolução
- `/relatorios` — mês, ano, projeção 3/6/12
- Aporte/resgate em aplicações (`investment_buy` / `investment_sell`)
- Histórico de PL ao desbloquear o cofre

### Status Fase 5 (V3 — inteligência local)
- Domínio `intelligence.ts`: recorrências, categorização por histórico, anomalias, forecast detalhado, análise de carteira
- `/inteligencia` — sugestões com confirmação explícita (nunca auto-muta)
- Importação usa `suggestCategoryFromHistory` quando não há regra
- Painel mostra trecho de anomalias + link
- Testes em `v3.test.ts`

### Multi-usuários / cofres locais
- IndexedDB v2: `profiles` + `vaults` (envelope por `vaultId`); migração do `vault/current` legado
- AuthGate: seleção de usuário → PIN → unlock; onboarding demo/vazio
- Trocar usuário limpa memória; Bloquear pede PIN do mesmo perfil
- Cofre: perfil, alterar PIN (recriptografa), export/import (novo usuário ou substituir), excluir
- Demo: `createDemoSnapshot()` — dados fictícios independentes



## Mapa UI × domínio (Fase 2)

Rotas em `src/app/*` só montam páginas; domínio entra em `src/components/pages/*`.

| Página | Papel | O que muda na Fase 2 |
| --- | --- | --- |
| Painel / Fluxo | Leem `monthlyCashflow`, insights | Passar a `cashflowFromTransactions` + `RecurringRule` |
| Rendas / Gastos / Aplicações / Dívidas / Metas / Categorias | CRUD via `upsertEntity` nas listas legadas | Gravar `RecurringRule` / `Transaction` / `InvestmentPosition` / `Account` |
| Importar | `bank-import` → `buildImportDraft` → `oneTime*` | `applyImportDraft` cria `Transaction` (+ conta) |
| Cofre | Envelope v1; mostra `schemaVersion` | Sem mudança de crypto |

Persistência: `vault-context` cifra o `VaultSnapshot` inteiro; adapters não conhecem entidades.

**Assimetria conhecida do painel:** filtro por instituição usa dívidas totais no PL legado — no ledger, dívidas e faturas entram como passivos de forma explícita.

