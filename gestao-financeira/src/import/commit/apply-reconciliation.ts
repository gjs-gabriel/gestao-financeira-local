/**
 * Persistência de decisões de conciliação no snapshot (aliases + encerrados).
 */

import { createId } from "@/domain/snapshot";
import type { VaultSnapshot } from "@/domain/types";
import type { FinancialImportDraft } from "../types";
import { normalizeInvestmentName } from "../normalize/names";

export function applyReconciliationSideEffects(
  snapshot: VaultSnapshot,
  draft: FinancialImportDraft,
): VaultSnapshot {
  const now = new Date().toISOString();
  let next = snapshot;
  const aliases = [...(next.investmentAliases ?? [])];
  const pending = draft.pendingAliases ?? [];

  for (const a of pending) {
    const norm = a.normalizedName || normalizeInvestmentName(a.rawName);
    const exists = aliases.some(
      (x) =>
        x.investmentId === a.investmentId && x.normalizedName === norm,
    );
    if (exists) continue;
    aliases.push({
      id: createId("ialias"),
      investmentId: a.investmentId,
      rawName: a.rawName.slice(0, 200),
      normalizedName: norm,
      createdAt: now,
    });
  }

  // Aliases implícitos de matches vinculados
  for (const m of draft.reconciliation?.matches ?? []) {
    if (
      m.userDecision === "link_to" &&
      m.existingId &&
      m.importedLabel
    ) {
      const norm = normalizeInvestmentName(m.importedLabel);
      if (
        !aliases.some(
          (x) => x.investmentId === m.existingId && x.normalizedName === norm,
        )
      ) {
        aliases.push({
          id: createId("ialias"),
          investmentId: m.existingId,
          rawName: m.importedLabel.slice(0, 200),
          normalizedName: norm,
          createdAt: now,
        });
      }
    }
  }

  next = { ...next, investmentAliases: aliases };

  const closures = new Set(draft.pendingClosures ?? []);
  for (const m of draft.reconciliation?.matches ?? []) {
    if (m.userDecision === "mark_closed" && m.existingId) {
      closures.add(m.existingId);
    }
  }
  if (closures.size > 0) {
    next = {
      ...next,
      investments: next.investments.map((inv) =>
        closures.has(inv.id)
          ? { ...inv, lifecycle: "closed" as const, updatedAt: now }
          : inv,
      ),
    };
  }

  // Metadado do documento
  const docs = [...(next.importedDocuments ?? [])];
  docs.push({
    id: createId("idoc"),
    fileName: draft.documentInfo.fileName.slice(0, 200),
    sourceKind: draft.source,
    documentType: draft.documentType,
    institutionId: draft.institution?.institutionId,
    periodStart: draft.documentInfo.period.start,
    periodEnd: draft.documentInfo.period.end,
    importedAt: now,
  });
  next = { ...next, importedDocuments: docs };

  return next;
}
