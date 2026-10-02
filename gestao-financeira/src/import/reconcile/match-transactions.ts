import { createId } from "@/domain/snapshot";
import type { VaultSnapshot } from "@/domain/types";
import { normalizeDescription } from "../normalize/names";
import type { IntermediateTransaction } from "../schema/intermediate";
import type { ImportMatch } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function matchTransactions(input: {
  snapshot: VaultSnapshot;
  transactions: IntermediateTransaction[];
}): ImportMatch[] {
  const txs = input.snapshot.transactions ?? [];
  const matches: ImportMatch[] = [];

  for (const row of input.transactions) {
    const amount = Math.abs(row.amount);
    const date = row.transaction_date ?? row.posting_date ?? null;
    const desc = normalizeDescription(row.raw_description);

    if (row.fitid) {
      const byFit = txs.find(
        (t) => t.importHash === `ofx:${row.fitid}` && t.status !== "ignored",
      );
      if (byFit) {
        matches.push({
          id: createId("match"),
          entityType: "transaction",
          action: "POSSIBLE_DUPLICATE",
          confidence: "EXACT",
          importedTempId: row.temp_id,
          existingId: byFit.id,
          importedLabel: row.raw_description,
          existingLabel: byFit.description,
          importedValue: amount,
          existingValue: byFit.amount,
          date,
          reason: "FITID OFX já importado",
        });
        continue;
      }
    }

    if (row.refnum) {
      const byRef = txs.find(
        (t) =>
          t.importHash === `ref:${row.refnum}` && t.status !== "ignored",
      );
      if (byRef) {
        matches.push({
          id: createId("match"),
          entityType: "transaction",
          action: "POSSIBLE_DUPLICATE",
          confidence: "EXACT",
          importedTempId: row.temp_id,
          existingId: byRef.id,
          importedLabel: row.raw_description,
          existingLabel: byRef.description,
          importedValue: amount,
          existingValue: byRef.amount,
          date,
          reason: "Referência bancária já importada",
        });
        continue;
      }
    }

    if (!date || amount <= 0) {
      matches.push({
        id: createId("match"),
        entityType: "transaction",
        action: "NEEDS_CONFIRMATION",
        confidence: "NONE",
        importedTempId: row.temp_id,
        importedLabel: row.raw_description,
        importedValue: amount,
        date,
        reason: "Data ou valor ausente",
      });
      continue;
    }

    const soft = txs.find((t) => {
      if (t.status === "ignored" || t.status === "duplicate") return false;
      if (t.date !== date) return false;
      if (Math.abs(t.amount - amount) >= 0.005) return false;
      const td = normalizeDescription(t.description);
      return td === desc || td.includes(desc) || desc.includes(td);
    });

    if (soft) {
      matches.push({
        id: createId("match"),
        entityType: "transaction",
        action: "POSSIBLE_DUPLICATE",
        confidence: "HIGH",
        importedTempId: row.temp_id,
        existingId: soft.id,
        importedLabel: row.raw_description,
        existingLabel: soft.description,
        importedValue: amount,
        existingValue: soft.amount,
        difference: round2(amount - soft.amount),
        date,
        reason: "Conta + data + valor + descrição semelhantes",
      });
      continue;
    }

    const isMovement =
      row.kind === "APPLICATION" ||
      row.kind === "REDEMPTION" ||
      row.relationship === "APPLICATION" ||
      row.relationship === "REDEMPTION";

    matches.push({
      id: createId("match"),
      entityType: "transaction",
      action: "NEW",
      confidence: "HIGH",
      importedTempId: row.temp_id,
      importedLabel: row.raw_description,
      importedValue: amount,
      date,
      isMovementNotPosition: isMovement,
      reason: isMovement
        ? "Nova movimentação (não interpreta valor como posição)"
        : "Novo lançamento",
    });
  }

  return matches;
}
