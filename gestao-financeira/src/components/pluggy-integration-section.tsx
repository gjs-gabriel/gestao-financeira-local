"use client";

import { useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  KeyRound,
  Link2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface PluggyIntegrationSectionProps {
  itemIdsText: string;
  onItemIdsChange: (value: string) => void;
  lastSyncedAt?: string;
  busy: boolean;
  onSaveItemIds: () => void;
  onSyncNow: () => void;
  /** Slot do widget Pluggy Connect (abrir banco + consentimento). */
  connectSlot?: ReactNode;
}

function GuideBlock({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/50 bg-background/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border/40 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function PluggyIntegrationSection({
  itemIdsText,
  onItemIdsChange,
  lastSyncedAt,
  busy,
  onSaveItemIds,
  onSyncNow,
  connectSlot,
}: PluggyIntegrationSectionProps) {
  return (
    <section className="surface-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="type-label mb-1">Open Finance</p>
          <h2 className="font-heading text-lg font-medium">
            Bancos conectados (Pluggy)
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Traga saldos, extratos, faturas e investimentos do seu banco para
            este app — sem digitar lançamento por lançamento. A conexão é feita
            pelo Open Finance brasileiro, via Pluggy.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-background/50 p-3.5">
          <Building2 className="mb-2 size-4 text-primary" />
          <p className="text-sm font-medium text-foreground">O que é</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Open Finance é a regra do Banco Central que permite você autorizar
            um app a <strong className="font-medium text-foreground/90">ler</strong>{" "}
            seus dados bancários (com o seu consentimento). A Pluggy é a ponte
            técnica entre o banco e este aplicativo.
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/50 p-3.5">
          <ShieldCheck className="mb-2 size-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Quão seguro é</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Você autentica no próprio banco. Este app{" "}
            <strong className="font-medium text-foreground/90">não guarda</strong>{" "}
            senha do internet banking. Os dados financeiros ficam cifrados no
            seu cofre local (.gfin), protegidos pelo seu PIN.
          </p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/50 p-3.5">
          <RefreshCw className="mb-2 size-4 text-primary" />
          <p className="text-sm font-medium text-foreground">O que entra aqui</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Contas e saldos, extratos (gastos e receitas), faturas de cartão,
            parcelas e investimentos — alimentando Fluxo, Relatórios e
            Patrimônio automaticamente.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <GuideBlock title="1. Como obter os dados na Pluggy (passo a passo)" defaultOpen>
          <ol className="list-decimal space-y-2.5 pl-4">
            <li>
              Crie (ou entre na) conta de desenvolvedor em{" "}
              <a
                href="https://dashboard.pluggy.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                dashboard.pluggy.ai
              </a>
              . Para uso pessoal gratuito, siga também o guia{" "}
              <a
                href="https://docs.pluggy.ai/docs/guides/meu-pluggy-personal-use"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Meu Pluggy
              </a>
              .
            </li>
            <li>
              No Dashboard, anote o <strong className="text-foreground/90">Client ID</strong>{" "}
              e o <strong className="text-foreground/90">Client Secret</strong> da
              sua aplicação. Coloque-os no ambiente do app (arquivo{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                .env.local
              </code>{" "}
              ou variáveis do launcher):
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted/80 px-3 py-2 text-[11px] leading-relaxed text-foreground">
                {`PLUGGY_CLIENT_ID=seu-client-id
PLUGGY_CLIENT_SECRET=seu-client-secret
# Opcional — webhooks (HTTPS público, ex. ngrok):
# PLUGGY_WEBHOOK_PUBLIC_URL=https://seu-tunel.ngrok.app/api/webhooks/pluggy
# PLUGGY_WEBHOOK_SECRET=um-segredo-forte`}
              </pre>
              Reinicie o app depois de salvar. A Pluggy{" "}
              <strong className="text-foreground/90">não aceita localhost</strong>{" "}
              como URL de webhook — use um túnel HTTPS em desenvolvimento.
            </li>
            <li>
              Preferência: use o botão{" "}
              <strong className="text-foreground/90">Conectar banco (Pluggy)</strong>{" "}
              abaixo — o widget abre o banco, o consentimento e devolve o{" "}
              <strong className="text-foreground/90">itemId</strong>{" "}
              automaticamente para o cofre.
            </li>
            <li>
              Alternativa: conecte no Dashboard / Meu Pluggy, copie os itemIds
              (código tipo{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                a0922d6f-2007-…
              </code>
              ), cole no campo abaixo e use{" "}
              <strong className="text-foreground/90">Salvar</strong> +{" "}
              <strong className="text-foreground/90">Sincronizar agora</strong>.
            </li>
          </ol>
          <p className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs">
            Dica: você pode conectar vários bancos no Dashboard da Pluggy e
            trazer todos de uma vez — basta listar todos os itemIds aqui.
          </p>
        </GuideBlock>

        <GuideBlock title="2. Segurança — o que acontece com meus dados?">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground/90">Senha do banco:</strong>{" "}
              digitada só no fluxo oficial do banco / Pluggy. Nunca fica
              salva neste aplicativo.
            </li>
            <li>
              <strong className="text-foreground/90">Chaves da Pluggy</strong>{" "}
              (Client ID / Secret): ficam no{" "}
              <em>servidor local</em> do app, não no navegador e não no arquivo
              .gfin.
            </li>
            <li>
              <strong className="text-foreground/90">Extratos e saldos:</strong>{" "}
              depois da sincronização, entram no seu cofre cifrado (AES-256 com
              o PIN). Só quem tem o PIN neste dispositivo consegue abrir.
            </li>
            <li>
              <strong className="text-foreground/90">Sem nuvem nossa:</strong>{" "}
              este app é local-first. Não enviamos seu dinheiro para um servidor
              nosso — o sync só lê a Pluggy e grava no cofre da máquina.
            </li>
            <li>
              Você pode revogar o consentimento a qualquer momento no banco ou
              no Dashboard Pluggy; aí a conexão deixa de atualizar.
            </li>
          </ul>
        </GuideBlock>

        <GuideBlock title="3. Como usar no dia a dia">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground/90">Primeira vez:</strong>{" "}
              configure as chaves → cole os itemIds → Sincronizar agora.
            </li>
            <li>
              <strong className="text-foreground/90">Atualizações:</strong> a
              Pluggy costuma refrescar os dados do banco cerca de 1× por dia no
              plano gratuito. Este app também evita puxar de novo antes de 24h
              (para não gastar limites à toa). Use{" "}
              <em>Sincronizar agora</em> quando quiser forçar.
            </li>
            <li>
              <strong className="text-foreground/90">Ao desbloquear o cofre:</strong>{" "}
              se já houver itemIds salvos, o app tenta um sync suave sozinho
              (respeitando as 24h).
            </li>
            <li>
              Depois do sync, abra <em>Fluxo</em>, <em>Relatórios</em> e{" "}
              <em>Patrimônio</em> — os gráficos usam os mesmos dados que você
              já conhece, agora preenchidos pelo banco.
            </li>
            <li>
              Lançamentos manuais continuam válidos. O sync acrescenta/atualiza
              o que veio da Pluggy sem apagar o que você cadastrou à mão.
            </li>
          </ul>
        </GuideBlock>

        <GuideBlock title="4. Glossário rápido">
          <dl className="space-y-2.5">
            <div className="flex gap-2">
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div>
                <dt className="font-medium text-foreground">itemId</dt>
                <dd>
                  Identificador de uma conexão banco↔Pluggy (ex.: “meu Nubank”).
                  É o que você cola abaixo.
                </dd>
              </div>
            </div>
            <div className="flex gap-2">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div>
                <dt className="font-medium text-foreground">
                  Client ID / Client Secret
                </dt>
                <dd>
                  “Usuário e senha” da sua aplicação na Pluggy. Só o servidor do
                  app usa isso para pedir permissão de leitura.
                </dd>
              </div>
            </div>
            <div className="flex gap-2">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div>
                <dt className="font-medium text-foreground">.gfin / cofre</dt>
                <dd>
                  Arquivo cifrado com seus dados financeiros neste computador.
                  Os itemIds e a data da última sync também ficam nele.
                </dd>
              </div>
            </div>
            <div className="flex gap-2">
              <Smartphone className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div>
                <dt className="font-medium text-foreground">Meu Pluggy</dt>
                <dd>
                  Modo de uso pessoal da Pluggy: você conecta as próprias contas
                  e lê os dados pela API, sem precisar de um produto comercial
                  completo.
                </dd>
              </div>
            </div>
          </dl>
        </GuideBlock>
      </div>

      <div className="mt-6 space-y-3 border-t border-border/50 pt-5">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Conectar pelo app
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Abra o Pluggy Connect, escolha o banco e autorize. O{" "}
            <code className="text-[11px]">itemId</code> entra no cofre
            automaticamente. Exige{" "}
            <code className="text-[11px]">PLUGGY_CLIENT_ID</code> /{" "}
            <code className="text-[11px]">PLUGGY_CLIENT_SECRET</code> no
            servidor.
          </p>
        </div>
        {connectSlot}

        <div className="pt-2">
          <h3 className="text-sm font-medium text-foreground">
            Conexões neste cofre
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ou cole itemIds do Dashboard (um por linha / vírgula) se preferir
            o fluxo manual.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pluggy-item-ids">ItemIds</Label>
          <textarea
            id="pluggy-item-ids"
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[88px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            value={itemIdsText}
            onChange={(e) => onItemIdsChange(e.target.value)}
            placeholder={"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
            spellCheck={false}
          />
          {lastSyncedAt ? (
            <p className="text-xs text-muted-foreground">
              Última sincronização:{" "}
              <time dateTime={lastSyncedAt}>
                {new Date(lastSyncedAt).toLocaleString("pt-BR")}
              </time>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ainda não sincronizado neste cofre.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onSaveItemIds}
          >
            Salvar itemIds
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={busy}
            onClick={onSyncNow}
          >
            <RefreshCw className="size-3.5" />
            Sincronizar agora
          </Button>
        </div>
      </div>
    </section>
  );
}
