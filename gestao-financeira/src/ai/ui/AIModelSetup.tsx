"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AIStatusBadge } from "./AIStatus";
import { useAI } from "./AIProvider";
import { LOCAL_AI_DEFAULT_MODEL } from "@/ai/local/types";

export function AIModelSetup({ compact = false }: { compact?: boolean }) {
  const {
    modelStatus,
    ensureModel,
    clearModelCache,
    setAIDisabled,
    runDiagnosticTest,
  } = useAI();
  const [localError, setLocalError] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const busy =
    busyAction ||
    modelStatus.status === "checking" ||
    modelStatus.status === "loading" ||
    modelStatus.status === "downloading";

  const showError = Boolean(
    localError ||
      modelStatus.error ||
      modelStatus.status === "error" ||
      modelStatus.status === "unsupported",
  );
  const errorText =
    localError ||
    modelStatus.error ||
    modelStatus.message ||
    "Assistente local indisponível";

  async function handleConnect() {
    setLocalError(null);
    setDiag(null);
    setBusyAction(true);
    try {
      await ensureModel();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(msg);
      console.error("[AI] Falha ao conectar ao runtime local:", e);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleDiagnostic() {
    setLocalError(null);
    setDiag(null);
    setBusyAction(true);
    try {
      const result = await runDiagnosticTest();
      setDiag(
        result.ok
          ? `✓ Runtime operacional — ${result.detail}`
          : `Teste falhou — ${result.detail}`,
      );
      if (!result.ok) setLocalError(result.detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(msg);
      setDiag(`Teste falhou — ${msg}`);
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <AIStatusBadge status={modelStatus} />

      {!compact ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-2">
          <p className="font-medium">Assistente Financeiro Local</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            A inferência ocorre só no runtime local (Ollama). O navegador envia
            um JSON de contexto agregado e formata o JSON de resposta — sem
            executar modelo nem WebGPU. Endpoint:{" "}
            <code className="text-[11px]">127.0.0.1:43128</code>.
          </p>
          <ol className="list-decimal pl-4 text-xs text-muted-foreground space-y-1">
            <li>
              Instale o{" "}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Ollama
              </a>
            </li>
            <li>
              Baixe o modelo:{" "}
              <code className="text-[11px]">
                ollama pull {LOCAL_AI_DEFAULT_MODEL}
              </code>
            </li>
            <li>
              Inicie o runtime:{" "}
              <code className="text-[11px]">npm run ai:runtime</code>
            </li>
            <li>Volte aqui e clique em Conectar</li>
          </ol>
          <p className="text-xs text-muted-foreground pt-1">
            Checklist completo e botão para iniciar o runtime:{" "}
            <Link
              href="/ia"
              className="text-primary underline-offset-2 hover:underline"
            >
              Gerenciador da IA
            </Link>
            .
          </p>
        </div>
      ) : null}

      {!compact ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="type-label">Runtime</dt>
            <dd className="mt-0.5 font-medium">Local AI Runtime (Ollama)</dd>
          </div>
          <div>
            <dt className="type-label">Modelo preferido</dt>
            <dd className="mt-0.5 font-medium">
              {modelStatus.modelId ?? LOCAL_AI_DEFAULT_MODEL}
            </dd>
          </div>
          <div>
            <dt className="type-label">Endpoint</dt>
            <dd className="mt-0.5 font-medium text-xs">
              http://127.0.0.1:43128
            </dd>
          </div>
          <div>
            <dt className="type-label">Dados para nuvem</dt>
            <dd className="mt-0.5 font-medium">Não</dd>
          </div>
        </dl>
      ) : null}

      {showError ? (
        <div
          className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-semibold text-destructive">
            Assistente local indisponível
          </p>
          <p className="mt-1 text-destructive/95 whitespace-pre-wrap">
            {errorText}
          </p>
          {modelStatus.technicalError &&
          modelStatus.technicalError !== errorText ? (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-background/80 p-2 text-[11px]">
              {modelStatus.technicalError}
            </pre>
          ) : null}
        </div>
      ) : null}

      {diag ? (
        <p
          className={`text-sm ${diag.startsWith("✓") ? "text-primary" : "text-destructive"}`}
          role="status"
        >
          {diag}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {modelStatus.status !== "disabled" ? (
          <Button size="sm" disabled={busy} onClick={() => void handleConnect()}>
            {modelStatus.status === "ready"
              ? "Reconectar"
              : "Conectar assistente local"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void handleDiagnostic()}
        >
          Executar teste
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            setAIDisabled(modelStatus.status !== "disabled")
          }
        >
          {modelStatus.status === "disabled"
            ? "Ativar IA"
            : "Desativar IA"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            void clearModelCache().catch((e) => {
              setLocalError(e instanceof Error ? e.message : String(e));
            });
          }}
        >
          Limpar pareamento
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        🔒 Processamento local — o navegador só envia um resumo agregado ao
        runtime em localhost. PIN e chave do cofre nunca são enviados. Sem
        runtime, o Analista continua com o resumo calculado pelo sistema.
      </p>
    </div>
  );
}
