"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

export function AIChat() {
  const { ask, chatTurns, clearConversation, modelStatus } = useAI();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                {t.role === "user" ? "Você" : "Analista"}
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
            {busy
              ? modelStatus.status === "generating"
                ? "Analisando…"
                : "Preparando…"
              : "Perguntar"}
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
