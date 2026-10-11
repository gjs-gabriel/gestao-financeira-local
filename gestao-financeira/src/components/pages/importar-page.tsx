"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui-helpers";
import { ImportWizard } from "@/import/ui/ImportWizard";
import { PluggyVaultPanel } from "@/components/pluggy-vault-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ImportMode = "clips" | "pluggy";

export function ImportarPage() {
  const [mode, setMode] = useState<ImportMode>("clips");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar"
        description="Escolha como trazer dados para o cofre: arquivos locais (Clips) ou bancos via Open Finance (Meu Pluggy)."
      />

      <Tabs
        value={mode}
        onValueChange={(v) => {
          if (v === "clips" || v === "pluggy") setMode(v);
        }}
      >
        <TabsList className="mb-2">
          <TabsTrigger value="clips">Clips</TabsTrigger>
          <TabsTrigger value="pluggy">Meu Pluggy</TabsTrigger>
        </TabsList>

        <TabsContent value="clips" className="space-y-3">
          <div>
            <p className="type-label mb-1">Arquivos</p>
            <h2 className="font-heading text-lg font-medium">Clips</h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Assistente de importação — PDF, Excel e CSV processados neste
              dispositivo.
            </p>
          </div>
          <ImportWizard />
        </TabsContent>

        <TabsContent value="pluggy" className="space-y-3">
          <PluggyVaultPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
