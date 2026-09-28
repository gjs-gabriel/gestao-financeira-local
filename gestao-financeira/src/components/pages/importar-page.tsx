"use client";

import { PageHeader } from "@/components/ui-helpers";
import { ImportWizard } from "@/import/ui/ImportWizard";

export function ImportarPage() {
  return (
    <div>
      <PageHeader
        title="Clips"
        description="Seu assistente de importação — PDF, Excel e CSV processados neste dispositivo."
      />
      <ImportWizard />
    </div>
  );
}
