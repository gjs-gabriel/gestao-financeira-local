import { createId } from "@/domain/snapshot";
import type { Investment, VaultSnapshot } from "@/domain/types";
import {
  extractMaturityYear,
  nameSimilarity,
  normalizeInvestmentName,
} from "../normalize/names";
import type {
  IntermediateInvestment,
  IntermediateInvestmentPosition,
} from "../schema/intermediate";
import type {
  ImportMatch,
  ImportMatchCandidate,
  MatchConfidence,
} from "./types";

function confidenceFromScore(score: number, exactIds: boolean): MatchConfidence {
  if (exactIds || score >= 0.999) return "EXACT";
  if (score >= 0.92) return "HIGH";
  if (score >= 0.78) return "MEDIUM";
  if (score >= 0.55) return "LOW";
  return "NONE";
}

function scoreInvestment(
  imported: IntermediateInvestment,
  existing: Investment,
  aliases: { investmentId: string; normalizedName: string }[],
): { score: number; exactId: boolean; reason: string } {
  if (imported.isin && existing.isin && imported.isin === existing.isin) {
    return { score: 1, exactId: true, reason: "ISIN idêntico" };
  }
  if (imported.cnpj && existing.cnpj && imported.cnpj === existing.cnpj) {
    return { score: 1, exactId: true, reason: "CNPJ idêntico" };
  }
  if (
    imported.ticker &&
    existing.ticker &&
    imported.ticker.toUpperCase() === existing.ticker.toUpperCase()
  ) {
    return { score: 1, exactId: true, reason: "Ticker idêntico" };
  }
  if (
    imported.external_id &&
    existing.externalId &&
    imported.external_id === existing.externalId
  ) {
    return { score: 1, exactId: true, reason: "ID da instituição" };
  }

  const normImported = imported.normalized_name || normalizeInvestmentName(imported.raw_name);
  const aliasHit = aliases.find(
    (a) =>
      a.normalizedName === normImported &&
      (!imported.institution_id ||
        !existing.institutionId ||
        a.investmentId === existing.id),
  );
  if (aliasHit && aliasHit.investmentId === existing.id) {
    return { score: 0.97, exactId: false, reason: "Alias confirmado" };
  }

  if (
    imported.institution_id &&
    existing.institutionId &&
    imported.institution_id !== existing.institutionId
  ) {
    return { score: 0, exactId: false, reason: "Instituição diferente" };
  }

  const matA = imported.maturity_date?.slice(0, 4)
    ? Number(imported.maturity_date.slice(0, 4))
    : extractMaturityYear(imported.raw_name);
  const matB = existing.maturityDate?.slice(0, 4)
    ? Number(existing.maturityDate.slice(0, 4))
    : extractMaturityYear(existing.name);
  if (matA != null && matB != null && matA !== matB) {
    return {
      score: Math.min(0.4, nameSimilarity(imported.raw_name, existing.name)),
      exactId: false,
      reason: `Vencimentos distintos (${matA} vs ${matB})`,
    };
  }

  const nameScore = Math.max(
    nameSimilarity(imported.raw_name, existing.name),
    nameSimilarity(normImported, existing.normalizedName ?? existing.name),
    ...aliases
      .filter((a) => a.investmentId === existing.id)
      .map((a) => nameSimilarity(normImported, a.normalizedName)),
  );

  let score = nameScore;
  if (imported.institution_id && existing.institutionId === imported.institution_id) {
    score = Math.min(1, score + 0.05);
  }
  return {
    score,
    exactId: false,
    reason: score >= 0.78 ? "Nome + instituição" : "Similaridade textual",
  };
}

export function matchInvestments(input: {
  snapshot: VaultSnapshot;
  investments: IntermediateInvestment[];
}): ImportMatch[] {
  const { snapshot, investments } = input;
  const aliases = (snapshot.investmentAliases ?? []).map((a) => ({
    investmentId: a.investmentId,
    normalizedName: a.normalizedName,
  }));
  const used = new Set<string>();
  const matches: ImportMatch[] = [];

  for (const inv of investments) {
    const scored = snapshot.investments
      .map((existing) => {
        const s = scoreInvestment(inv, existing, aliases);
        return { existing, ...s };
      })
      .filter((x) => x.score >= 0.55)
      .sort((a, b) => b.score - a.score);

    const candidates: ImportMatchCandidate[] = scored.slice(0, 3).map((s) => ({
      entityId: s.existing.id,
      label: s.existing.name,
      score: s.score,
      detail: s.reason,
    }));

    const best = scored[0];
    if (!best || best.score < 0.55) {
      matches.push({
        id: createId("match"),
        entityType: "investment",
        action: "NEW",
        confidence: "NONE",
        importedTempId: inv.temp_id,
        importedLabel: inv.raw_name,
        reason: "Nenhuma correspondência encontrada",
      });
      continue;
    }

    const second = scored[1];
    const ambiguous =
      second &&
      best.score - second.score < 0.08 &&
      second.score >= 0.7 &&
      !best.exactId;

    if (ambiguous) {
      matches.push({
        id: createId("match"),
        entityType: "investment",
        action: "NEEDS_CONFIRMATION",
        confidence: "LOW",
        importedTempId: inv.temp_id,
        importedLabel: inv.raw_name,
        candidates,
        reason:
          "Dois ou mais investimentos podem corresponder — confirme manualmente",
      });
      continue;
    }

    if (used.has(best.existing.id) && best.score < 0.97) {
      matches.push({
        id: createId("match"),
        entityType: "investment",
        action: "NEEDS_CONFIRMATION",
        confidence: confidenceFromScore(best.score, best.exactId),
        importedTempId: inv.temp_id,
        importedLabel: inv.raw_name,
        candidates,
        reason: "Candidato já associado a outro item do documento",
      });
      continue;
    }

    const conf = confidenceFromScore(best.score, best.exactId);
    used.add(best.existing.id);

    if (conf === "LOW") {
      matches.push({
        id: createId("match"),
        entityType: "investment",
        action: "NEEDS_CONFIRMATION",
        confidence: conf,
        importedTempId: inv.temp_id,
        existingId: best.existing.id,
        importedLabel: inv.raw_name,
        existingLabel: best.existing.name,
        existingValue: best.existing.amount,
        candidates,
        reason: `${best.reason} (confiança baixa — não atualizar automaticamente)`,
      });
      continue;
    }

    matches.push({
      id: createId("match"),
      entityType: "investment",
      action: "UNCHANGED",
      confidence: conf,
      importedTempId: inv.temp_id,
      existingId: best.existing.id,
      importedLabel: inv.raw_name,
      existingLabel: best.existing.name,
      existingValue: best.existing.amount,
      reason: best.reason,
    });
  }

  return matches;
}

export function matchPositions(input: {
  snapshot: VaultSnapshot;
  positions: IntermediateInvestmentPosition[];
  investmentMatches: ImportMatch[];
}): ImportMatch[] {
  const byTemp = new Map(
    input.investmentMatches.map((m) => [m.importedTempId, m]),
  );
  const history = input.snapshot.investmentPositionHistory ?? [];
  const matches: ImportMatch[] = [];

  for (const pos of input.positions) {
    const invMatch = byTemp.get(pos.investment_temp_id);
    const investmentId = invMatch?.existingId;
    const existing = investmentId
      ? history.find(
          (h) => h.investmentId === investmentId && h.date === pos.date,
        )
      : undefined;

    if (!investmentId) {
      matches.push({
        id: createId("match"),
        entityType: "investment_position",
        action: invMatch?.action === "NEW" ? "NEW" : "NEEDS_CONFIRMATION",
        confidence: invMatch?.confidence ?? "NONE",
        importedTempId: pos.temp_id,
        importedLabel: invMatch?.importedLabel ?? "Posição",
        importedValue: pos.value,
        date: pos.date,
        reason: "Investimento ainda não vinculado — posição pendente",
      });
      continue;
    }

    if (!existing) {
      matches.push({
        id: createId("match"),
        entityType: "investment_position",
        action: "NEW",
        confidence: invMatch.confidence,
        importedTempId: pos.temp_id,
        existingId: investmentId,
        importedLabel: invMatch.importedLabel,
        existingLabel: invMatch.existingLabel,
        importedValue: pos.value,
        date: pos.date,
        reason: "Nova posição histórica para a data do documento",
      });
      continue;
    }

    const diff = Math.round((pos.value - existing.value) * 100) / 100;
    if (Math.abs(diff) < 0.005) {
      matches.push({
        id: createId("match"),
        entityType: "investment_position",
        action: "UNCHANGED",
        confidence: "EXACT",
        importedTempId: pos.temp_id,
        existingId: existing.id,
        importedLabel: invMatch.importedLabel,
        existingLabel: invMatch.existingLabel,
        importedValue: pos.value,
        existingValue: existing.value,
        difference: 0,
        date: pos.date,
        reason: "Posição já cadastrada com o mesmo valor",
      });
      continue;
    }

    matches.push({
      id: createId("match"),
      entityType: "investment_position",
      action: "CONFLICT",
      confidence: "HIGH",
      importedTempId: pos.temp_id,
      existingId: existing.id,
      importedLabel: invMatch.importedLabel,
      existingLabel: invMatch.existingLabel,
      importedValue: pos.value,
      existingValue: existing.value,
      difference: diff,
      date: pos.date,
      reason: "Posição existente na mesma data com valor diferente",
    });
  }

  return matches;
}
