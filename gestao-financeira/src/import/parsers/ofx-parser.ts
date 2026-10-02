/**
 * Parser OFX 1.x / 2.x (SGML ou XML) — 100% offline.
 * Extrai FITID, datas, valores, contas e saldo quando disponíveis.
 */

import { createId } from "@/domain/snapshot";
import { normalizeInvestmentName } from "../normalize/names";
import {
  emptyIntermediate,
  type FinancialImportIntermediate,
} from "../schema/intermediate";

function tagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** OFX date: YYYYMMDD ou YYYYMMDDHHMMSS[...] → YYYY-MM-DD */
export function parseOfxDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const mo = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const iso = `${y}-${mo}-${d}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

export function parseOfxAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function extractBlocks(text: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)(?=<${tag}>|</${tag}>|$)`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

export function parseOfxText(
  text: string,
  fileName: string,
): FinancialImportIntermediate {
  const mid = emptyIntermediate(fileName, "ofx");
  mid.source.document_type = "BANK_STATEMENT";

  if (!/<OFX>/i.test(text) && !/<STMTTRN>/i.test(text)) {
    mid.warnings.push("Conteúdo não parece OFX válido.");
    return mid;
  }

  const bankId = tagValue(text, "BANKID");
  const acctId = tagValue(text, "ACCTID");
  const acctType = tagValue(text, "ACCTTYPE");
  const balAmt = parseOfxAmount(tagValue(text, "BALAMT"));
  const dtAsOf = parseOfxDate(tagValue(text, "DTASOF"));
  const curDef = tagValue(text, "CURDEF") ?? "BRL";

  const accountTemp = createId("iacc");
  mid.accounts.push({
    temp_id: accountTemp,
    bank_id: bankId ?? undefined,
    account_id: acctId,
    account_digits: acctId?.replace(/\D/g, "") ?? null,
    label: acctId ? `Conta ${acctId}` : "Conta OFX",
    type:
      /SAVINGS/i.test(acctType ?? "")
        ? "savings"
        : /MONEYMRKT|INVESTMENT/i.test(acctType ?? "")
          ? "investment_cash"
          : "checking",
    currency: curDef,
    closing_balance: balAmt,
    as_of: dtAsOf,
  });

  if (balAmt != null) {
    mid.statement_summaries.push({
      temp_id: createId("isum"),
      account_temp_id: accountTemp,
      initial_balance: null,
      net_income: null,
      total_credits: null,
      total_debits: null,
      final_balance: balAmt,
      math_ok: null,
    });
  }

  const trnBlocks = extractBlocks(text, "STMTTRN");
  for (const block of trnBlocks) {
    const fitid = tagValue(block, "FITID");
    const trnamt = parseOfxAmount(tagValue(block, "TRNAMT"));
    const dtPosted = parseOfxDate(tagValue(block, "DTPOSTED"));
    const dtUser = parseOfxDate(tagValue(block, "DTUSER"));
    const name = tagValue(block, "NAME") ?? "";
    const memo = tagValue(block, "MEMO") ?? "";
    const checknum = tagValue(block, "CHECKNUM");
    const refnum = tagValue(block, "REFNUM");
    const trntype = tagValue(block, "TRNTYPE") ?? "";

    if (trnamt == null) continue;
    const description = [name, memo].filter(Boolean).join(" — ") || "Lançamento OFX";
    const signed = trnamt;
    const abs = Math.abs(signed);

    mid.transactions.push({
      temp_id: createId("itx"),
      account_temp_id: accountTemp,
      kind: signed < 0 ? "DEBIT" : "CREDIT",
      transaction_date: dtUser ?? dtPosted,
      posting_date: dtPosted,
      amount: abs,
      signed_amount: signed,
      raw_description: description,
      normalized_description: normalizeInvestmentName(description).toLowerCase(),
      fitid: fitid ?? undefined,
      refnum: refnum ?? undefined,
      checknum: checknum ?? undefined,
      memo: memo || undefined,
      evidence: {
        text: description.slice(0, 240),
        extraction_method: "OFX",
        confidence: 0.99,
      },
    });

    void trntype;
  }

  mid.source.period = {
    start:
      mid.transactions
        .map((t) => t.transaction_date)
        .filter(Boolean)
        .sort()[0] ?? null,
    end:
      mid.transactions
        .map((t) => t.transaction_date)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
  };

  return mid;
}

export async function parseOfxFile(file: File): Promise<FinancialImportIntermediate> {
  const text = await file.text();
  return parseOfxText(text, file.name);
}
