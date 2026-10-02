import { parseBrAmount } from "@/adapters/bank-import";
import { matchInstitutionByName } from "@/domain/institutions";
import type { InvestmentClass } from "@/domain/types";
import type {
  ImportAccountSnapshot,
  ImportHoldingSnapshot,
  ImportInstitutionInfo,
  ParsedDocument,
  ParsedDocumentRow,
} from "../types";

const MONEY_RE =
  /([+-])?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/g;

const MONTHS: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
};

const BANK_RULES: { re: RegExp; name: string }[] = [
  { re: /picpay/i, name: "PicPay" },
  {
    re: /nubank|nu\s+pagamentos|nu\s+financeira|nu\s+investimentos|(?:^|[^a-z0-9])nu_\d/i,
    name: "Nubank",
  },
  { re: /banco\s+inter|\binter\s+s\.?\s*a\b/i, name: "Banco Inter" },
  { re: /ita[uú]|itau\s+unibanco/i, name: "Itaú Unibanco" },
  { re: /bradesco/i, name: "Bradesco" },
  { re: /santander/i, name: "Santander" },
  { re: /caixa\s+econ[oô]mica|\bcef\b/i, name: "Caixa Econômica Federal" },
  { re: /banco\s+do\s+brasil/i, name: "Banco do Brasil" },
  { re: /btg\s*pactual|\bbtg\b/i, name: "BTG Pactual" },
  { re: /c6\s*bank|\bc6\b/i, name: "C6 Bank" },
  { re: /mercado\s*pago/i, name: "Mercado Pago" },
  { re: /xp\s+investimentos|\bxp\s+inc/i, name: "XP Investimentos" },
  { re: /pagbank|pagseguro/i, name: "PagBank" },
  { re: /safra/i, name: "Safra" },
  { re: /sicoob/i, name: "Sicoob" },
  { re: /sicredi/i, name: "Sicredi" },
];

export interface MoneyHit {
  value: number;
  signed: boolean;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseMoneyHits(text: string): MoneyHit[] {
  const re = new RegExp(MONEY_RE.source, "g");
  const out: MoneyHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const parsed = parseBrAmount(match[2] ?? "");
    if (parsed == null) continue;
    const sign = match[1] === "-" ? -1 : 1;
    out.push({
      value: round2(sign * Math.abs(parsed)),
      signed: match[1] === "+" || match[1] === "-",
    });
  }
  return out;
}

export function firstMoney(text: string): number | null {
  return parseMoneyHits(text)[0]?.value ?? null;
}

function stripMoney(text: string): string {
  return text.replace(new RegExp(MONEY_RE.source, "g"), " ").replace(/\s+/g, " ").trim();
}

function toIso(day: number, month: number, year: number): string | null {
  let y = year;
  if (y < 100) y += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseLooseDate(text: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/.exec(text);
  if (br) return toIso(Number(br[1]), Number(br[2]), Number(br[3]));

  const named = /\b(\d{1,2})\s+(?:de\s+)?([a-z.]+)\s+(?:de\s+)?(\d{4})\b/i.exec(
    stripAccents(text),
  );
  if (!named) return null;
  const month = MONTHS[named[2]!.replace(/\./g, "").toLowerCase()];
  if (!month) return null;
  return toIso(Number(named[1]), month, Number(named[3]));
}

export function classifyProduct(
  name: string,
  context = "",
): InvestmentClass {
  const s = stripAccents(`${name} ${context}`).toLowerCase();
  if (/cripto|bitcoin|\bbtc\b|\beth\b/.test(s)) return "cripto";
  if (/previd/.test(s)) return "previdencia";
  if (/\bfii\b|fundo imobili/.test(s)) return "fiis";
  if (/\betf\b/.test(s)) return "etfs";
  if (/\bacoes\b|bolsa de valores/.test(s)) return "acoes";
  if (/poupanc/.test(s)) return "poupanca";
  if (
    /cofrinho|\bcdb\b|\brdb\b|tesouro|\blci\b|\blca\b|\bcri\b|\bcra\b|debenture|titulo|fundo|\bfif\b|renda fixa/
      .test(s)
  ) {
    return "renda_fixa";
  }
  return "outro";
}

export function detectInstitution(
  text: string,
  fileName: string,
): ImportInstitutionInfo | null {
  const hay = `${fileName}\n${text}`;
  for (const rule of BANK_RULES) {
    if (!rule.re.test(hay)) continue;
    const matched = matchInstitutionByName(rule.name, []);
    return {
      institutionId: matched.institutionId ?? "inst-outro",
      institutionName: rule.name,
    };
  }
  return null;
}

function accountDigitsFromDisplay(account: string): string | null {
  const compact = account.replace(/\s/g, "");
  const hyphen = /^(\d+)-(\d)$/.exec(compact);
  if (hyphen) return `${hyphen[1]}${hyphen[2]}`;
  const digits = compact.replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

function nubankDisplay(digits: string): string {
  if (digits.length < 2) return digits;
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

function amountAfterLabel(lines: string[], label: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i] ?? "")) continue;
    const rest = (lines[i] ?? "").replace(label, " ");
    const onLine = parseMoneyHits(rest);
    const signed = onLine.find((h) => h.signed) ?? onLine[0];
    if (signed) return signed.value;
    const next = lines[i + 1] ?? "";
    const nextHits = parseMoneyHits(next);
    const bare = stripMoney(next);
    if (nextHits[0] && bare.length < 4) return nextHits[0].value;
  }
  return null;
}

function parsePeriod(
  lines: string[],
  fileName: string,
): { start: string | null; end: string | null } {
  const head = stripAccents(lines.slice(0, 25).join(" "));
  const range =
    /(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\s+a\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i.exec(
      head,
    );
  if (range) {
    const start = parseLooseDate(
      `${range[1]} de ${range[2]} de ${range[3]}`,
    );
    const end = parseLooseDate(`${range[4]} de ${range[5]} de ${range[6]}`);
    if (start && end) return { start, end };
  }
  const file =
    /_(\d{2})([A-Za-z]{3})(\d{4})_(\d{2})([A-Za-z]{3})(\d{4})/i.exec(fileName);
  if (file) {
    const start = parseLooseDate(`${file[1]} ${file[2]} ${file[3]}`);
    const end = parseLooseDate(`${file[4]} ${file[5]} ${file[6]}`);
    if (start && end) return { start, end };
  }
  return { start: null, end: null };
}

function parseStatementAccount(
  lines: string[],
  fileName: string,
  institution: ImportInstitutionInfo | null,
): { agency: string | null; account: string | null } {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i] ?? "";
    if (!/ag[eê]ncia/i.test(line)) continue;
    const agency = /ag[eê]ncia\s+(\d{1,6})/i.exec(line)?.[1] ?? null;
    const same = /conta\s*[:.]?\s*(\d{4,12}-\d)/i.exec(line);
    if (same) return { agency, account: same[1]! };
    const next = (lines[i + 1] ?? "").trim();
    const nxt = /^(\d{4,12}-\d)$/.exec(next);
    if (nxt) return { agency, account: nxt[1]! };
  }
  if (institution?.institutionId === "inst-nubank") {
    const fromFile = /(?:^|_)(\d{6,12})(?:_|\.)/.exec(fileName);
    if (fromFile) return { agency: "0001", account: nubankDisplay(fromFile[1]!) };
  }
  return { agency: null, account: null };
}

function isFooter(line: string): boolean {
  return /ouvidoria|^\s*sac\b|p[aá]gina \d|extrato gerado|nao nos responsabilizamos|não nos responsabilizamos|asseguramos a autenticidade|tem alguma d[uú]vida|cnpj\s*:|saldo l[ií]quido corresponde|informa[cç][oõ]es originalmente/i.test(
    line,
  );
}

function classifyMovement(
  description: string,
  signed: number,
): { type: ParsedDocumentRow["typeHint"]; holdingName: string | null; description: string } {
  const plain = description.replace(/\s+/g, " ").trim();
  const folded = stripAccents(plain).toLowerCase();
  if (/aplicacao|aporte|compra de (cdb|rdb|tesouro|fundo)/.test(folded)) {
    const name = plain
      .replace(/^aplica[cç][aã]o(?:\s+fundo)?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      type: "investment",
      holdingName: name || plain,
      description: `Aplicação · ${name || plain}`,
    };
  }
  if (/^resgate|venda de (cdb|rdb|tesouro|fundo)/.test(folded)) {
    const name = plain.replace(/^resgate(?:\s+de)?\s*/i, "").trim();
    return {
      type: "investment",
      holdingName: name || plain,
      description: `Resgate · ${name || plain}`,
    };
  }
  if (/pagamento de fatura/.test(folded)) {
    return {
      type: "expense",
      holdingName: null,
      description: "Pagamento de fatura",
    };
  }
  if (/^(rendimento|juros)\b/.test(folded)) {
    return { type: "income", holdingName: null, description: plain };
  }
  if (signed > 0) return { type: "income", holdingName: null, description: plain };
  return { type: "expense", holdingName: null, description: plain || "Lançamento" };
}

function movementAmount(block: string[]): number | null {
  const headHits = parseMoneyHits(block[0] ?? "");
  const signed = [...headHits].reverse().find((h) => h.signed);
  if (signed) return signed.value;
  const head = stripAccents(block[0] ?? "").toLowerCase();
  const magnitude =
    [...headHits].reverse()[0]?.value ??
    parseMoneyHits(block.slice(1).join(" ")).at(-1)?.value ??
    null;
  if (magnitude == null) return null;
  if (/saida/.test(head)) return -Math.abs(magnitude);
  if (/entrada/.test(head)) return Math.abs(magnitude);
  return magnitude;
}

function parseMovements(lines: string[], periodEnd: string | null): ParsedDocumentRow[] {
  const start = lines.findIndex((l) => /movimenta[cç][oõ]es/i.test(l));
  if (start < 0) return [];
  const body = lines.slice(start + 1);
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of body) {
    if (isFooter(line)) break;
    if (parseLooseDate(line)) {
      if (current) blocks.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current);

  const rows: ParsedDocumentRow[] = [];
  for (const block of blocks) {
    const date = parseLooseDate(block[0] ?? "");
    const signed = movementAmount(block);
    if (!date || signed == null || signed === 0) continue;
    const detail = block
      .slice(1)
      .map((line) =>
        stripMoney(line).replace(/total de (entradas|sa[ií]das)/gi, " ").trim(),
      )
      .filter(Boolean)
      .join(" ");
    const classified = classifyMovement(detail || "Lançamento", signed);
    rows.push({
      id: "",
      rawText: `${block[0]} ${detail}`.replace(/\s+/g, " ").trim().slice(0, 400),
      dateCandidate: date,
      amountCandidate: signed,
      descriptionCandidate: classified.description.slice(0, 180),
      typeHint: classified.type,
      holdingName: classified.holdingName,
    });
  }

  const yieldAmount = amountAfterLabel(lines, /rendimento l[ií]quido/i);
  const already = rows.some((r) =>
    /^rendimento/i.test(r.descriptionCandidate ?? ""),
  );
  if (yieldAmount != null && Math.abs(yieldAmount) >= 0.01 && !already && periodEnd) {
    rows.push({
      id: "",
      rawText: "Rendimento líquido",
      dateCandidate: periodEnd,
      amountCandidate: yieldAmount,
      descriptionCandidate: "Rendimento líquido da conta",
      typeHint: "income",
      holdingName: null,
    });
  }

  return rows.map((row, index) => ({
    ...row,
    id: `row-${String(index + 1).padStart(3, "0")}`,
  }));
}

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

function stripCnpj(text: string): string {
  return text.replace(CNPJ_RE, " ").replace(/\s+/g, " ").trim();
}

function parseAgencyAccountLine(line: string): {
  agency: string;
  account: string;
  amounts: number[];
} | null {
  const amounts = parseMoneyHits(line).map((h) => h.value);
  if (amounts.length === 0) return null;
  const rest = stripCnpj(stripMoney(line));
  const hyphen = /(\d{1,5})\s+(\d{4,12})-(\d)\b/.exec(rest);
  if (hyphen) {
    return {
      agency: hyphen[1]!,
      account: `${hyphen[2]}-${hyphen[3]}`,
      amounts,
    };
  }
  const match = /(\d{1,4})\s+(\d{4,12})\s+(\d)\b/.exec(rest);
  if (!match) return null;
  return {
    agency: match[1]!,
    account: `${match[2]}-${match[3]}`,
    amounts,
  };
}

function yearEnds(text: string): number[] {
  const found = [
    ...text.matchAll(/31\/12\/(20\d{2})/g),
    ...text.matchAll(/\bdez(?:embro)?\/(20\d{2})/gi),
  ].map((match) => Number(match[1]));
  const years = [...new Set(found)].sort();
  if (years.length > 0) return years;
  const calendar = /ano calend[aá]rio\s+(20\d{2})/i.exec(text);
  return calendar ? [Number(calendar[1])] : [];
}

function latestBalance(
  years: number[],
  amounts: number[],
): { asOf: string; amount: number } | null {
  if (years.length === 0 || amounts.length === 0) return null;
  const year = years[Math.min(years.length, amounts.length) - 1] ?? years.at(-1)!;
  const amount = amounts[Math.min(years.length, amounts.length) - 1] ?? amounts.at(-1)!;
  return { asOf: `${year}-12-31`, amount };
}

const LABEL_SKIP =
  /^(informe|imposto|pessoa|fonte pagadora|cnpj|nome\b|bens e direitos|informa|grupo de bens|c[oó]digo|localiza|ag[eê]ncia|saldo em|rendimentos|p[aá]gina|valores em|picpay|nubank|banco )/i;

function productLabel(lines: string[]): string | null {
  for (const line of lines) {
    const label = stripMoney(line);
    if (label.length < 3 || label.length > 80) continue;
    if (LABEL_SKIP.test(label)) continue;
    if (parseAgencyAccountLine(line)) continue;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(label)) continue;
    return label;
  }
  return null;
}

function yieldNote(lines: string[]): string | undefined {
  const hits = parseMoneyHits(lines.join("\n")).filter((h) => h.value > 0);
  const last = hits.at(-1);
  if (!last) return undefined;
  const formatted = last.value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return `Rendimentos informados no documento: ${formatted}`;
}

function splitSections(lines: string[]): string[][] {
  const sections: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const starts =
      /fonte pagadora/i.test(line) &&
      current.some((item) => /fonte pagadora/i.test(item));
    if (starts) {
      sections.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) sections.push(current);
  return sections;
}

function pushAccount(
  target: ImportAccountSnapshot[],
  input: {
    institution: ImportInstitutionInfo;
    agency: string | null;
    account: string | null;
    balance: number;
    asOf: string;
  },
): void {
  const digits = input.account ? accountDigitsFromDisplay(input.account) : null;
  const number = input.account;
  const label = number
    ? `${input.institution.institutionName} · ${number}`
    : input.institution.institutionName;
  if (
    target.some(
      (item) =>
        item.accountDigits &&
        digits &&
        item.accountDigits === digits &&
        item.institutionId === input.institution.institutionId,
    )
  ) {
    return;
  }
  target.push({
    id: `acct-${String(target.length + 1).padStart(2, "0")}`,
    institutionId: input.institution.institutionId,
    institutionName: input.institution.institutionName,
    agency: input.agency,
    accountNumber: number,
    accountDigits: digits,
    label,
    accountType: "checking",
    openingBalance: null,
    closingBalance: input.balance,
    asOf: input.asOf,
    periodStart: null,
    balanceMode: "snapshot",
    include: true,
  });
}

function pushHolding(
  target: ImportHoldingSnapshot[],
  input: {
    institution: ImportInstitutionInfo;
    name: string;
    amount: number;
    asOf: string;
    context: string;
    notes?: string;
  },
): void {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 120);
  const existing = target.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!name) return;
  if (existing) {
    if (input.notes) addHoldingNote(existing, input.notes);
    return;
  }
  target.push({
    id: `hold-${String(target.length + 1).padStart(2, "0")}`,
    institutionId: input.institution.institutionId,
    institutionName: input.institution.institutionName,
    name,
    amount: input.amount,
    asOf: input.asOf,
    classification: classifyProduct(name, input.context),
    mode: "snapshot",
    notes: input.notes,
    include: true,
  });
}

function positionLabel(line: string): string {
  return stripCnpj(stripMoney(line))
    .replace(/\b\d{1,5}\s+\d{4,12}-\d\b/g, " ")
    .replace(/\b\d{1,4}\s+\d{4,12}\s+\d\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAccountRow(line: string, label: string): boolean {
  const agency = parseAgencyAccountLine(line);
  if (!agency) return false;
  if (/saldo em cc|conta corrente|conta pagamento|dep[oó]sito/i.test(line)) {
    return true;
  }
  return !/[A-Za-zÀ-ÿ]{3}/.test(label);
}

function classificationFor(
  name: string,
  group: "conta" | "renda_fixa" | "fundo" | "fii" | null,
): InvestmentClass {
  const specific = classifyProduct(name, group ?? "");
  if (specific !== "outro") return specific;
  if (group === "fii") return "fiis";
  if (
    group === "renda_fixa" ||
    group === "fundo" ||
    /tributad|isent|renda fixa|aplica[cç][aã]o autom[aá]tica/.test(
      stripAccents(name).toLowerCase(),
    )
  ) {
    return "renda_fixa";
  }
  return "outro";
}

function formatBrlNote(amount: number): string {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addHoldingNote(holding: ImportHoldingSnapshot, note: string): void {
  if (!note || holding.notes?.includes(note)) return;
  holding.notes = [holding.notes, note].filter(Boolean).join(" · ");
}

function productNamesMatch(a: string, b: string): boolean {
  const key = (value: string) =>
    stripAccents(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const x = key(a);
  const y = key(b);
  if (!x || !y || x.length < 8 || y.length < 8) return false;
  if (x === y) return true;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  return short.length >= 22 && long.startsWith(short);
}

function attachYieldNotes(
  lines: string[],
  holdings: ImportHoldingSnapshot[],
): void {
  let mode: "isento" | "cdb" | "fund" | "fii" | null = null;
  const isento: number[] = [];
  const cdb: number[] = [];
  const named: { name: string; amount: number }[] = [];

  for (const line of lines) {
    if (/rendimentos isentos/i.test(line)) {
      mode = "isento";
      continue;
    }
    if (/rendimentos sujeitos/i.test(line)) {
      mode = "cdb";
      continue;
    }
    if (/fundos imobili/i.test(line)) {
      mode = "fii";
      continue;
    }
    if (/fundos de investimento/i.test(line)) {
      mode = "fund";
      continue;
    }
    if (!mode) continue;
    const hits = parseMoneyHits(line);
    if (hits.length !== 1) continue;
    const label = positionLabel(line);
    if (mode === "fund" || mode === "fii") {
      if (/[A-Za-zÀ-ÿ]{3}/.test(label)) {
        named.push({ name: label, amount: hits[0]!.value });
      }
      continue;
    }
    if (mode === "isento") isento.push(hits[0]!.value);
    if (mode === "cdb") cdb.push(hits[0]!.value);
  }

  const isentoTotal = isento.reduce((sum, value) => sum + value, 0);
  if (isentoTotal > 0) {
    const note = `Rendimentos isentos informados (LCI, LCA e similares): ${formatBrlNote(isentoTotal)}`;
    for (const holding of holdings) {
      if (/isento/i.test(holding.name) && !/tributad/i.test(holding.name)) {
        addHoldingNote(holding, note);
      }
    }
  }

  const cdbTotal = cdb.reduce((sum, value) => sum + value, 0);
  if (cdbTotal > 0) {
    const note = `Rendimentos de CDB/RDB informados no grupo, sem divisão por papel: ${formatBrlNote(cdbTotal)}`;
    for (const holding of holdings) {
      if (/tributad/i.test(holding.name)) addHoldingNote(holding, note);
    }
  }

  for (const item of named) {
    if (item.amount <= 0) continue;
    const holding = holdings.find((candidate) =>
      productNamesMatch(candidate.name, item.name),
    );
    if (!holding) continue;
    addHoldingNote(
      holding,
      `Rendimentos informados no documento: ${formatBrlNote(item.amount)}`,
    );
  }
}

function collectPositionRows(
  lines: string[],
  institution: ImportInstitutionInfo,
  accounts: ImportAccountSnapshot[],
  holdings: ImportHoldingSnapshot[],
): void {
  const years = yearEnds(lines.join("\n"));
  let group: "conta" | "renda_fixa" | "fundo" | "fii" | null = null;
  for (const line of lines) {
    if (/conta corrente|grupo\s*06|dep[oó]sito\s+[àa]\s*vista/i.test(line)) {
      group = "conta";
    } else if (/fundos imobili/i.test(line)) {
      group = "fii";
    } else if (/fundos de investimento|grupo\s*07/i.test(line)) {
      group = "fundo";
    } else if (/renda fixa|grupo\s*04|aplica[cç][oõ]es e investimentos/i.test(line)) {
      group = "renda_fixa";
    }

    const hits = parseMoneyHits(line);
    if (hits.length < 2) continue;
    const picked = latestBalance(
      years,
      hits.map((hit) => hit.value),
    );
    if (!picked) continue;
    const label = positionLabel(line);
    if (isAccountRow(line, label)) {
      const agency = parseAgencyAccountLine(line);
      pushAccount(accounts, {
        institution,
        agency: agency?.agency ?? null,
        account: agency?.account ?? null,
        balance: picked.amount,
        asOf: picked.asOf,
      });
      continue;
    }
    if (!/[A-Za-zÀ-ÿ]{3}/.test(label) || label.length > 120) continue;
    if (/^(cnpj|descri|situa|ag[eê]ncia|c[oó]digo|grupo)\b/i.test(label)) continue;
    const created: ImportHoldingSnapshot = {
      id: "",
      institutionId: institution.institutionId,
      institutionName: institution.institutionName,
      name: label,
      amount: picked.amount,
      asOf: picked.asOf,
      classification: classificationFor(label, group),
      mode: "snapshot",
      include: true,
    };
    pushHolding(holdings, {
      institution,
      name: created.name,
      amount: created.amount,
      asOf: created.asOf,
      context: group ?? "",
      notes: undefined,
    });
    const stored = holdings.find(
      (item) => item.name.toLowerCase() === created.name.toLowerCase(),
    );
    if (stored) stored.classification = created.classification;
  }
}

function parseIncomeReport(
  lines: string[],
  institution: ImportInstitutionInfo,
): { accounts: ImportAccountSnapshot[]; holdings: ImportHoldingSnapshot[] } {
  const accounts: ImportAccountSnapshot[] = [];
  const holdings: ImportHoldingSnapshot[] = [];

  for (const section of splitSections(lines)) {
    const yieldIdx = section.findIndex((line) =>
      /rendimentos sujeitos/i.test(line),
    );
    const before = yieldIdx >= 0 ? section.slice(0, yieldIdx) : section;
    const assetCut = before.findIndex((line) =>
      /rendimentos isentos|rendimentos sujeitos/i.test(line),
    );
    const assetLines = assetCut >= 0 ? before.slice(0, assetCut) : before;
    const yields = yieldIdx >= 0 ? section.slice(yieldIdx + 1) : [];
    collectPositionRows(assetLines, institution, accounts, holdings);
    const text = before.join("\n");
    const years = yearEnds(text);
    const deposit =
      /dep[oó]sito\s+[àa]\s*vista|conta corrente|conta de pagamento|conta pagamento/i.test(
        text,
      );
    const investment =
      /aplica[cç][oõ]es|investimentos|cofrinho|\bcdb\b|\brdb\b|tesouro|fundo|poupan/i.test(
        stripAccents(text),
      );

    const agencyLine = before
      .map((line) => parseAgencyAccountLine(line))
      .find((item) => item != null);

    if (deposit) {
      const picked = agencyLine
        ? latestBalance(years, agencyLine.amounts)
        : null;
      if (picked) {
        pushAccount(accounts, {
          institution,
          agency: agencyLine?.agency ?? null,
          account: agencyLine?.account ?? null,
          balance: picked.amount,
          asOf: picked.asOf,
        });
      }
    }

    if (investment && !deposit) {
      const amountLine = before.find((line) => {
        const hits = parseMoneyHits(line);
        return hits.length >= 2 && !parseAgencyAccountLine(line);
      });
      const amounts = amountLine ? parseMoneyHits(amountLine).map((h) => h.value) : [];
      const picked = latestBalance(years, amounts);
      const afterAmounts = amountLine
        ? before.slice(before.indexOf(amountLine) + 1)
        : before;
      const onAmount = amountLine ? stripMoney(amountLine) : "";
      const name =
        (onAmount.length >= 3 && !LABEL_SKIP.test(onAmount) ? onAmount : null) ??
        productLabel(afterAmounts) ??
        productLabel(before) ??
        "Aplicação";
      if (picked) {
        pushHolding(holdings, {
          institution,
          name,
          amount: picked.amount,
          asOf: picked.asOf,
          context: text,
          notes: yieldNote(yields),
        });
      }
    }

    if (!deposit && !investment) {
      for (const line of before) {
        const hits = parseMoneyHits(line);
        if (hits.length < 2) continue;
        const label = positionLabel(line);
        if (!label || LABEL_SKIP.test(label)) continue;
        const picked = latestBalance(years, hits.map((h) => h.value));
        if (!picked) continue;
        if (/conta corrente|conta pagamento|dep[oó]sito/i.test(label)) {
          pushAccount(accounts, {
            institution,
            agency: null,
            account: null,
            balance: picked.amount,
            asOf: picked.asOf,
          });
        } else if (/[A-Za-zÀ-ÿ]{3}/.test(label)) {
          pushHolding(holdings, {
            institution,
            name: label,
            amount: picked.amount,
            asOf: picked.asOf,
            context: text,
            notes: yieldNote(yields),
          });
        }
      }
    }
  }

  attachYieldNotes(lines, holdings);
  return { accounts, holdings };
}

function emptyParsed(
  partial: Partial<ParsedDocument> & { recognized: boolean },
): ParsedDocument & { recognized: boolean } {
  return {
    documentType: "unknown",
    sourceKind: "pdf",
    period: { start: null, end: null },
    rows: [],
    warnings: [],
    institution: null,
    accounts: [],
    holdings: [],
    ...partial,
  };
}

/**
 * Lê linhas já reconstruídas de um PDF (extrato ou informe de rendimentos).
 * Não grava no cofre e não devolve CPF.
 */
export function analyzeFinancialDocument(
  lines: string[],
  fileName: string,
): ParsedDocument & { recognized: boolean } {
  const text = lines.join("\n");
  const institution = detectInstitution(text, fileName);
  const isReport = /informe de rendimentos/i.test(text);
  const isStatement =
    /movimenta[cç][oõ]es/i.test(text) && /saldo inicial/i.test(text);

  if (isReport) {
    const bank = institution ?? {
      institutionId: "inst-outro",
      institutionName: "Instituição do informe",
    };
    const { accounts, holdings } = parseIncomeReport(lines, bank);
    const latest = accounts[0]?.asOf ?? holdings[0]?.asOf ?? null;
    const year = latest?.slice(0, 4) ?? null;
    const warnings = [
      "Informe de rendimentos: o saldo da conta e das aplicações será atualizado. Os rendimentos do informe não entram como receita — eles já estão no saldo.",
    ];
    if (accounts.length === 0 && holdings.length === 0) {
      warnings.push(
        "Identificamos o informe, mas não encontramos saldo de conta nem de aplicação.",
      );
    }
    return emptyParsed({
      recognized: accounts.length > 0 || holdings.length > 0,
      documentType: "income_report",
      institution: bank,
      accounts,
      holdings,
      period: year
        ? { start: `${year}-01-01`, end: `${year}-12-31` }
        : { start: null, end: null },
      openingBalance: null,
      closingBalance: accounts[0]?.closingBalance ?? null,
      warnings,
    });
  }

  if (isStatement) {
    const period = parsePeriod(lines, fileName);
    const located = parseStatementAccount(lines, fileName, institution);
    const opening = amountAfterLabel(lines, /saldo inicial/i);
    const closing = amountAfterLabel(lines, /saldo final/i);
    const bank = institution ?? {
      institutionId: "inst-outro",
      institutionName: "Banco do extrato",
    };
    const rows = parseMovements(lines, period.end);
    const digits = located.account
      ? accountDigitsFromDisplay(located.account)
      : null;
    const accounts: ImportAccountSnapshot[] = [];
    if (closing != null) {
      accounts.push({
        id: "acct-01",
        institutionId: bank.institutionId,
        institutionName: bank.institutionName,
        agency: located.agency,
        accountNumber: located.account,
        accountDigits: digits,
        label: located.account
          ? `${bank.institutionName} · ${located.account}`
          : bank.institutionName,
        accountType: "checking",
        openingBalance: opening,
        closingBalance: closing,
        asOf: period.end ?? new Date().toISOString().slice(0, 10),
        periodStart: period.start,
        balanceMode: "statement",
        include: true,
      });
    }
    const warnings: string[] = [];
    if (rows.some((row) => row.typeHint === "investment")) {
      warnings.push(
        "Aportes e resgates foram separados dos gastos e atualizam a aplicação.",
      );
    }
    if (!located.account) {
      warnings.push(
        "Não encontramos o número da conta. O saldo será lançado na conta identificada pelo banco.",
      );
    }
    return emptyParsed({
      recognized: accounts.length > 0 || rows.length > 0,
      documentType: "bank_statement",
      institution: bank,
      accounts,
      holdings: [],
      period,
      openingBalance: opening,
      closingBalance: closing,
      rows,
      warnings,
    });
  }

  return emptyParsed({
    recognized: false,
    institution,
    documentType: "unknown",
  });
}
