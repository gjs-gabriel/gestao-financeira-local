/**
 * Converte ParsedDocument (wizard atual) → formato intermediário versionado.
 */

import { createId } from "@/domain/snapshot";
import { normalizeInvestmentName } from "../normalize/names";
import { validateStatementMath } from "../reconcile/statement-math";
import {
  emptyIntermediate,
  type FinancialImportIntermediate,
  type IntermediateDocumentType,
  type IntermediateMovementKind,
} from "../schema/intermediate";
import type { ParsedDocument } from "../types";

function mapDocType(
  t: ParsedDocument["documentType"],
): IntermediateDocumentType {
  if (t === "bank_statement") return "BANK_STATEMENT";
  if (t === "income_report") return "INCOME_REPORT";
  return "UNKNOWN";
}

function movementKindFromHint(
  typeHint: string | undefined,
  description: string,
): IntermediateMovementKind | null {
  const d = description.toLowerCase();
  if (/aplica[cç][aã]o|aplica[cç][aã]o fundo|aporte/i.test(d)) {
    return "APPLICATION";
  }
  if (/resgate/i.test(d)) return "REDEMPTION";
  if (/rendimento|dividend|juros/i.test(d)) return "INCOME";
  if (typeHint === "investment") return "APPLICATION";
  return null;
}

export function parsedDocumentToIntermediate(
  parsed: ParsedDocument,
  fileName: string,
): FinancialImportIntermediate {
  const mid = emptyIntermediate(fileName, parsed.sourceKind);
  mid.source.document_type = mapDocType(parsed.documentType);
  mid.source.institution = parsed.institution?.institutionName ?? null;
  mid.source.institution_id = parsed.institution?.institutionId ?? null;
  mid.source.period = parsed.period;
  mid.warnings = [...parsed.warnings];

  const invByName = new Map<string, string>();

  for (const holding of parsed.holdings ?? []) {
    const norm = normalizeInvestmentName(holding.name);
    let invTemp = invByName.get(norm);
    if (!invTemp) {
      invTemp = createId("iinv");
      invByName.set(norm, invTemp);
      mid.investments.push({
        temp_id: invTemp,
        raw_name: holding.name,
        normalized_name: norm,
        institution_id: holding.institutionId,
        institution_name: holding.institutionName,
        type_hint: holding.classification,
      });
    }

    if (holding.mode === "snapshot") {
      mid.investment_positions.push({
        temp_id: createId("ipos"),
        investment_temp_id: invTemp,
        date: holding.asOf,
        value: holding.amount,
        evidence: {
          text: holding.name,
          extraction_method: "DOCUMENT_PARSER",
          confidence: 0.9,
        },
      });
    } else {
      mid.investment_movements.push({
        temp_id: createId("imov"),
        investment_temp_id: invTemp,
        kind: holding.amount >= 0 ? "APPLICATION" : "REDEMPTION",
        date: holding.asOf,
        amount: Math.abs(holding.amount),
        signed_amount: holding.amount,
        raw_description: holding.name,
      });
    }
  }

  for (const account of parsed.accounts ?? []) {
    mid.accounts.push({
      temp_id: account.id || createId("iacc"),
      institution_id: account.institutionId,
      institution_name: account.institutionName,
      agency: account.agency,
      account_id: account.accountNumber,
      account_digits: account.accountDigits,
      label: account.label,
      type: account.accountType,
      opening_balance: account.openingBalance,
      closing_balance: account.closingBalance,
      as_of: account.asOf,
    });
  }

  if (
    parsed.openingBalance != null ||
    parsed.closingBalance != null
  ) {
    const math = validateStatementMath({
      initialBalance: parsed.openingBalance ?? null,
      totalCredits: null,
      totalDebits: null,
      netIncome: null,
      finalBalance: parsed.closingBalance ?? null,
    });
    mid.statement_summaries.push({
      temp_id: createId("isum"),
      period_start: parsed.period.start,
      period_end: parsed.period.end,
      initial_balance: parsed.openingBalance ?? null,
      net_income: null,
      total_credits: null,
      total_debits: null,
      final_balance: parsed.closingBalance ?? null,
      math_ok: math.ok,
    });
  }

  for (const row of parsed.rows) {
    const signed = row.amountCandidate ?? 0;
    const abs = Math.abs(signed);
    const movKind = movementKindFromHint(row.typeHint, row.descriptionCandidate ?? "");
    const isInvestment = row.typeHint === "investment" || movKind != null;

    let invTemp: string | null = null;
    if (row.holdingName) {
      const norm = normalizeInvestmentName(row.holdingName);
      invTemp = invByName.get(norm) ?? null;
      if (!invTemp) {
        invTemp = createId("iinv");
        invByName.set(norm, invTemp);
        mid.investments.push({
          temp_id: invTemp,
          raw_name: row.holdingName,
          normalized_name: norm,
          institution_id: parsed.institution?.institutionId,
          institution_name: parsed.institution?.institutionName,
        });
      }
    }

    mid.transactions.push({
      temp_id: row.id || createId("itx"),
      kind: isInvestment
        ? signed < 0
          ? "APPLICATION"
          : "REDEMPTION"
        : signed < 0
          ? "DEBIT"
          : signed > 0
            ? "CREDIT"
            : "UNKNOWN",
      transaction_date: row.dateCandidate,
      amount: abs,
      signed_amount: signed,
      raw_description: row.descriptionCandidate ?? row.rawText,
      investment_temp_id: invTemp,
      relationship: movKind,
      evidence: {
        text: row.rawText.slice(0, 240),
        extraction_method: "DOCUMENT_PARSER",
      },
    });

    if (isInvestment && movKind) {
      mid.investment_movements.push({
        temp_id: createId("imov"),
        investment_temp_id: invTemp,
        kind: movKind,
        date: row.dateCandidate ?? "",
        amount: abs,
        signed_amount: signed,
        raw_description: row.descriptionCandidate ?? row.rawText,
        linked_transaction_temp_id: row.id,
      });
    }
  }

  return mid;
}
