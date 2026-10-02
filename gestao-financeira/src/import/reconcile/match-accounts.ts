import { createId } from "@/domain/snapshot";
import type { VaultSnapshot } from "@/domain/types";
import type { IntermediateAccount } from "../schema/intermediate";
import type { ImportMatch } from "./types";

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function matchAccounts(input: {
  snapshot: VaultSnapshot;
  accounts: IntermediateAccount[];
}): ImportMatch[] {
  const accounts = input.snapshot.accounts ?? [];
  const matches: ImportMatch[] = [];

  for (const acc of input.accounts) {
    const digits = digitsOnly(acc.account_digits ?? acc.account_id);
    const marker =
      digits && acc.institution_id
        ? `[gfin:${acc.institution_id}:${digits}]`
        : null;

    const existing = accounts.find((a) => {
      if (marker && a.notes?.includes(marker)) return true;
      if (!digits || digits.length < 5) return false;
      if (
        acc.institution_id &&
        a.institutionId &&
        acc.institution_id !== a.institutionId
      ) {
        return false;
      }
      const hay = `${a.name} ${a.notes ?? ""}`.replace(/\D/g, "");
      return hay.includes(digits);
    });

    const importedBal = acc.closing_balance ?? null;
    if (!existing) {
      matches.push({
        id: createId("match"),
        entityType: "account",
        action: "NEW",
        confidence: digits.length >= 5 ? "HIGH" : "MEDIUM",
        importedTempId: acc.temp_id,
        importedLabel: acc.label ?? acc.account_id ?? "Conta",
        importedValue: importedBal,
        date: acc.as_of,
        reason: "Conta não encontrada no cofre",
      });
      continue;
    }

    matches.push({
      id: createId("match"),
      entityType: "account",
      action: "UPDATE",
      confidence: "EXACT",
      importedTempId: acc.temp_id,
      existingId: existing.id,
      importedLabel: acc.label ?? existing.name,
      existingLabel: existing.name,
      importedValue: importedBal,
      date: acc.as_of,
      reason: "Mesma conta (instituição + dígitos)",
    });
  }

  return matches;
}
