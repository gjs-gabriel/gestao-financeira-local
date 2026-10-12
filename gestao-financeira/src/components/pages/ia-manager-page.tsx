"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { AIModelSetup } from "@/ai/ui/AIModelSetup";
import { useAI } from "@/ai/ui/AIProvider";
import { LOCAL_AI_DEFAULT_MODEL } from "@/ai/local/types";

type Check = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  howToFix?: string;
};

type DiagnosePayload = {
  ready: boolean;
  preferredModel: string;
  fallbackModel: string;
  endpoints: { app: string; aiRuntime: string; ollama: string };
  ollamaModels: string[];
  checks: Check[];
  tip: string;
  ollamaInstalled?: boolean;
  error?: string;
};

export function IaManagerPage() {
  const { ensureModel, runDiagnosticTest, modelStatus } = useAI();
  const [diag, setDiag] = useState<DiagnosePayload | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    "diag" | "start" | "ollama" | "connect" | "test" | null
  >(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const runDiagnose = useCallback(async () => {
    setBusy("diag");
    setDiagError(null);
    try {
      const res = await fetch("/api/ai-runtime/diagnose", { cache: "no-store" });
      const body = (await res.json()) as DiagnosePayload;
      if (!res.ok) {
        setDiagError(body.error || `HTTP ${res.status}`);
        setDiag(null);
        return;
      }
      setDiag(body);
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : String(e));
      setDiag(null);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void runDiagnose();
  }, [runDiagnose]);

  async function handleStartRuntime() {
    setBusy("start");
    setActionMsg(null);
    try {
      const res = await fetch("/api/ai-runtime/start", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      setActionMsg(body.message || body.error || (body.ok ? "OK" : "Falha"));
      await runDiagnose();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleStartOllama() {
    setBusy("ollama");
    setActionMsg(null);
    try {
      const res = await fetch("/api/ai-runtime/start-ollama", {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      setActionMsg(body.message || body.error || (body.ok ? "OK" : "Falha"));
      await runDiagnose();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleConnect() {
    setBusy("connect");
    setActionMsg(null);
    try {
      await ensureModel();
      setActionMsg("Pareamento OK — assistente conectado.");
      await runDiagnose();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy("test");
    setActionMsg(null);
    try {
      const result = await runDiagnosticTest();
      setActionMsg(
        result.ok
          ? `Teste OK — ${result.detail}`
          : `Teste falhou — ${result.detail}`,
      );
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const checks = diag?.checks ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gerenciador da IA"
        description="Diagnóstico e controle do runtime que alimenta o Finn. Abrir só o Ollama não basta — o app precisa do Local AI Runtime na porta 43128."
      />

      <section className="space-y-4 border-t border-border/50 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium tracking-tight">Requisitos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadeia: Ollama (11434) → modelo → Runtime (43128) → Conectar no app
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void runDiagnose()}
          >
            {busy === "diag" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Verificando…
              </>
            ) : (
              "Diagnosticar"
            )}
          </Button>
        </div>

        {diagError ? (
          <p className="text-sm text-destructive" role="alert">
            Falha no diagnóstico: {diagError}
          </p>
        ) : null}

        {diag ? (
          <p
            className={`text-sm ${diag.ready ? "text-primary" : "text-muted-foreground"}`}
            role="status"
          >
            {diag.tip}
          </p>
        ) : null}

        <ul className="space-y-3">
          {checks.length === 0 && !diagError ? (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando checklist…
            </li>
          ) : null}
          {checks.map((c) => (
            <li
              key={c.id}
              className="flex gap-3 border-b border-border/40 pb-3 last:border-0"
            >
              <span className="mt-0.5 shrink-0">
                {c.ok ? (
                  <CheckCircle2 className="size-4 text-primary" aria-label="ok" />
                ) : (
                  <XCircle
                    className="size-4 text-destructive"
                    aria-label="pendente"
                  />
                )}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
                {!c.ok && c.howToFix ? (
                  <p className="text-xs text-foreground/80">→ {c.howToFix}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {diag?.ollamaModels?.length ? (
          <p className="text-xs text-muted-foreground">
            Modelos no Ollama: {diag.ollamaModels.slice(0, 8).join(", ")}
            {diag.ollamaModels.length > 8
              ? ` (+${diag.ollamaModels.length - 8})`
              : ""}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-base font-medium tracking-tight">Ações</h2>
        <p className="text-sm text-muted-foreground">
          Preferido:{" "}
          <code className="text-[11px]">
            {diag?.preferredModel ?? LOCAL_AI_DEFAULT_MODEL}
          </code>
          . Fallback:{" "}
          <code className="text-[11px]">
            {diag?.fallbackModel ?? "llama3.2:1b"}
          </code>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => void handleStartOllama()}
          >
            {busy === "ollama" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Iniciando Ollama…
              </>
            ) : (
              "Iniciar Ollama"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void handleStartRuntime()}
          >
            {busy === "start" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Iniciando…
              </>
            ) : (
              "Iniciar runtime"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void handleConnect()}
          >
            {busy === "connect" ? "Conectando…" : "Conectar / parear"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void handleTest()}
          >
            {busy === "test" ? "Testando…" : "Executar teste"}
          </Button>
        </div>
        {actionMsg ? (
          <p
            className={`text-sm whitespace-pre-wrap ${
              actionMsg.toLowerCase().includes("falh") ||
              actionMsg.toLowerCase().includes("indispon")
                ? "text-destructive"
                : "text-foreground"
            }`}
            role="status"
          >
            {actionMsg}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          No terminal:{" "}
          <code className="text-[11px]">ollama serve</code>
          {" · "}
          <code className="text-[11px]">
            ollama pull {diag?.preferredModel ?? LOCAL_AI_DEFAULT_MODEL}
          </code>
          {" · "}
          <code className="text-[11px]">npm run ai:runtime</code>
          {diag?.ollamaInstalled &&
          diag.checks.some((c) => c.id === "ollama" && !c.ok) ? (
            <span className="block mt-1">
              Ter o app Ollama na bandeja não garante a API — precisa responder
              em 11434.
            </span>
          ) : null}
        </p>
      </section>

      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-base font-medium tracking-tight">
          Por que abrir o Ollama não carrega a IA?
        </h2>
        <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
          <li>
            O Ollama só serve o modelo na porta{" "}
            <code className="text-[11px]">11434</code>. O navegador{" "}
            <em>não</em> fala com ele direto.
          </li>
          <li>
            O app Next (porta{" "}
            <code className="text-[11px]">43127</code>) chama o{" "}
            <strong className="font-medium text-foreground">
              Local AI Runtime
            </strong>{" "}
            em <code className="text-[11px]">127.0.0.1:43128</code>.
          </li>
          <li>
            Esse runtime consulta o Ollama, aplica limites/sessão e só então a
            IA fica disponível no Analista / importação.
          </li>
          <li>
            Depois do runtime no ar, clique em <em>Conectar / parear</em> (ou
            use o bloco abaixo).
          </li>
        </ol>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Circle
            className={`size-2.5 fill-current ${
              modelStatus.status === "ready"
                ? "text-primary"
                : "text-muted-foreground/40"
            }`}
          />
          Status no app: {modelStatus.message || modelStatus.status}
        </div>
      </section>

      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-base font-medium tracking-tight">
          Controles do assistente
        </h2>
        <AIModelSetup />
      </section>
    </div>
  );
}
