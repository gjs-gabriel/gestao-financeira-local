# Mitigação — Threat Model (TM-01–TM-05)

Plano de remediação defensiva do app local-first Gestão Financeira.  
Referência visual: canvas `threat-model-auditoria-seguranca` no projeto Cursor.

## Premissa

Atacante relevante está no mesmo host. Não há IdP remoto. A mitigação de **TM-05** eleva a barra de “qualquer `curl` em localhost” para “precisa do token opaco da sessão desbloqueada”.

## Checklist

| ID | Prioridade | Ação | Status |
|----|------------|------|--------|
| TM-05 / TM-04 | P0 | Gate de sessão no proxy Pluggy + secrets só em env server | Implementado |
| TM-02 | P1 | `safeLog` + zero-log de snapshot/PIN/secrets | Implementado |
| TM-03 | P1 | Sanitizar strings Pluggy na ingestão | Implementado |
| TM-01 | P2 | PIN mínimo 6 em cofres novos; wipe + revoke no lock | Implementado |
| CSP | P2 | Nota/TODO nonces; browser não chama `api.pluggy.ai` | Documentado |

## P0 — Proxy Pluggy

1. `src/security/pluggy-proxy-gate.ts` — tokens em memória + allowlist + TTL + rate limit.
2. `POST/DELETE /api/pluggy/session` — mint/revoke (localhost only).
3. `POST /api/pluggy/fetch` — exige `Authorization: Bearer`; `itemIds ⊆ allowlist`.
4. Cliente: mint após unlock / ao salvar itemIds; Bearer no sync; revoke no lock.
5. Credenciais: apenas `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` (nunca `NEXT_PUBLIC_`).

## P1 — Dados e XSS

- `src/security/safe-log.ts` — redaction de chaves sensíveis.
- `sanitizeBankString` / uso no `pluggy-mapper` para descriptions/nomes.

## P2 — PIN e residual

- `PIN_MIN_LENGTH = 6` para criação de cofres pessoais/admin.
- Demo Marina (`3247`) permanece no fluxo de demonstração.
- Residual: acesso físico com sessão aberta continua fora do TCB do app.
- CSP: `unsafe-inline` em scripts permanece até migração de nonces no Next.

## Fora de escopo

- Hardening de OS (FDE, antimalware).
- Remoção completa de `unsafe-inline` do CSP.
- Throttle de PIN persistente em disco.
