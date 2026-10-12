"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAI } from "./AIProvider";

const SUGGESTIONS = [
  "Como está minha situação financeira?",
  "Quais são meus maiores gastos?",
  "Existe algum padrão nos meus gastos?",
  "Quais pontos merecem atenção?",
  "Quanto preciso guardar para minha meta?",
  "Como está minha carteira?",
  "O que aconteceria se eu aumentasse meus aportes?",
];

export function AIChat({
  variant = "embedded",
}: {
  /** embedded = card no Analista; copilot = página cheia estilo ChatGPT */
  variant?: "embedded" | "copilot";
}) {
  const { ask, chatTurns, clearConversation, modelStatus } = useAI();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatTurns, busy]);

  async function submit(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    try {
      await ask(question);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao perguntar");
    } finally {
      setBusy(false);
    }
  }

  const busyLabel =
    modelStatus.status === "generating" ? "Analisando…" : "Preparando…";

  if (variant === "copilot") {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] flex-col md:min-h-[calc(100dvh-6rem)]">
        <div
          ref={logRef}
          className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-1 pb-4"
          role="log"
          aria-live="polite"
        >
          {chatTurns.length === 0 && !busy ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
              <div>
                <p className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
                  Finn
                </p>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Seu conselheiro estratégico. Pergunte sobre Patrimônio, Fluxo,
                  metas e carteira — respostas diretas, com base nos seus dados
                  locais.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto max-w-xs whitespace-normal rounded-xl bg-white/70 text-left text-xs font-medium"
                    disabled={busy}
                    onClick={() => void submit(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {chatTurns.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex w-full",
                    t.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[85%]",
                      t.role === "user"
                        ? "bg-foreground text-background"
                        : "surface-panel",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                        t.role === "user"
                          ? "text-background/60"
                          : "text-muted-foreground",
                      )}
                    >
                      {t.role === "user" ? "Você" : "Finn"}
                    </p>
                    <p className="whitespace-pre-wrap">{t.content}</p>
                  </div>
                </div>
              ))}
              {busy ? (
                <div className="flex justify-start">
                  <div className="surface-panel rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                    {busyLabel}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {error ? (
          <p className="mx-auto mb-2 w-full max-w-3xl text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-0 border-t border-border/40 bg-background/80 pt-3 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <div className="surface-panel flex items-end gap-2 p-2 md:p-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Mensagem para o Finn…"
                rows={1}
                className="min-h-[2.75rem] max-h-40 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  disabled={busy || !input.trim()}
                  onClick={() => void submit()}
                  className="rounded-xl"
                >
                  {busy ? busyLabel : "Enviar"}
                </Button>
                {chatTurns.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={clearConversation}
                  >
                    Limpar
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="px-1 pb-1 text-center text-[11px] text-muted-foreground">
              Enter envia · Shift+Enter nova linha · Finn processa só neste
              dispositivo
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant="outline"
            className="h-auto whitespace-normal text-left text-xs"
            disabled={busy}
            onClick={() => void submit(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <div
        ref={logRef}
        className="max-h-80 space-y-3 overflow-y-auto border-t border-border/40 pt-3"
        role="log"
        aria-live="polite"
      >
        {chatTurns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pergunte sobre suas finanças. Os cálculos vêm do sistema; a IA
            interpreta o contexto sanitizado.
          </p>
        ) : (
          chatTurns.map((t) => (
            <div
              key={t.id}
              className={
                t.role === "user"
                  ? "ml-6 rounded-lg bg-primary/5 px-3 py-2 text-sm"
                  : "mr-6 text-sm text-foreground"
              }
            >
              <p className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t.role === "user" ? "Você" : "Finn"}
              </p>
              <p className="whitespace-pre-wrap">{t.content}</p>
            </div>
          ))
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite uma pergunta…"
          rows={2}
          className="min-h-[2.5rem] flex-1"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex gap-2 sm:flex-col">
          <Button disabled={busy || !input.trim()} onClick={() => void submit()}>
            {busy ? busyLabel : "Perguntar"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={chatTurns.length === 0}
            onClick={clearConversation}
          >
            Limpar
          </Button>
        </div>
      </div>
    </div>
  );
}
