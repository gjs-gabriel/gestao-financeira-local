"use client";

import Link from "next/link";
import { AIChat } from "@/ai/ui/AIChat";
import { AIStatusBadge } from "@/ai/ui/AIStatus";
import { useAI } from "@/ai/ui/AIProvider";
import { PageHeader } from "@/components/ui-helpers";

export function FinnPage() {
  const { modelStatus, financialSnapshot } = useAI();

  if (!financialSnapshot) {
    return (
      <div>
        <PageHeader
          title="Finn"
          description="Desbloqueie o cofre para conversar com seu conselheiro financeiro."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Finn"
        description="Conselheiro estratégico local — sóbrio, direto, pautado nos seus números."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <AIStatusBadge status={modelStatus} />
            <Link
              href="/analista"
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              Ver panorama do Analista
            </Link>
          </div>
        }
      />

      {modelStatus.error || modelStatus.status === "error" ? (
        <div
          className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Finn indisponível no momento
          </p>
          <p className="mt-1 whitespace-pre-wrap text-destructive/95">
            {modelStatus.error ||
              modelStatus.message ||
              "Inicie o runtime (npm run ai:runtime) e o Ollama."}
          </p>
          <Link
            href="/ia"
            className="mt-2 inline-block text-xs font-medium text-foreground underline-offset-2 hover:underline"
          >
            Abrir Gerenciador IA
          </Link>
        </div>
      ) : null}

      <AIChat variant="copilot" />
    </div>
  );
}
