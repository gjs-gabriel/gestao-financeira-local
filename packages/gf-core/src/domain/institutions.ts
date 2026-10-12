import type { Institution } from "./types";

/**
 * Instituições seed (pt-BR) — bancos e fintechs principais.
 * IDs estáveis para migração. `inst-outro` = nome livre em institutionOther.
 */
export const SEED_INSTITUTIONS: Omit<Institution, "createdAt">[] = [
  { id: "inst-nubank", name: "Nubank" },
  { id: "inst-inter", name: "Banco Inter" },
  { id: "inst-mercado-pago", name: "Mercado Pago" },
  { id: "inst-picpay", name: "PicPay" },
  { id: "inst-bb", name: "Banco do Brasil" },
  { id: "inst-caixa", name: "Caixa Econômica Federal" },
  { id: "inst-swile", name: "Swile" },
  { id: "inst-itau", name: "Itaú Unibanco" },
  { id: "inst-bradesco", name: "Bradesco" },
  { id: "inst-santander", name: "Santander" },
  { id: "inst-btg", name: "BTG Pactual" },
  { id: "inst-c6", name: "C6 Bank" },
  { id: "inst-next", name: "Next" },
  { id: "inst-pagbank", name: "PagBank" },
  { id: "inst-original", name: "Banco Original" },
  { id: "inst-safra", name: "Safra" },
  { id: "inst-sicoob", name: "Sicoob" },
  { id: "inst-sicredi", name: "Sicredi" },
  { id: "inst-banrisul", name: "Banrisul" },
  { id: "inst-pan", name: "Banco Pan" },
  { id: "inst-bmg", name: "BMG" },
  { id: "inst-neon", name: "Neon" },
  { id: "inst-will", name: "will bank" },
  { id: "inst-xp", name: "XP Investimentos" },
  { id: "inst-rico", name: "Rico" },
  { id: "inst-clear", name: "Clear" },
  { id: "inst-modal", name: "Modalmais" },
  { id: "inst-avenue", name: "Avenue" },
  { id: "inst-nomad", name: "Nomad" },
  { id: "inst-stone", name: "Stone" },
  { id: "inst-asaas", name: "Asaas" },
  { id: "inst-digio", name: "Digio" },
  { id: "inst-agibank", name: "Agibank" },
  { id: "inst-bv", name: "Banco BV" },
  { id: "inst-votorantim", name: "Banco Votorantim" },
  { id: "inst-daycoval", name: "Daycoval" },
  { id: "inst-sofisa", name: "Sofisa Direto" },
  { id: "inst-bs2", name: "BS2" },
  { id: "inst-cora", name: "Cora" },
  { id: "inst-infinitepay", name: "InfinitePay" },
  { id: "inst-outro", name: "Outro" },
];

export const INSTITUTION_OTHER_ID = "inst-outro";

export function createSeedInstitutions(
  now = new Date().toISOString(),
): Institution[] {
  return SEED_INSTITUTIONS.map((i) => ({ ...i, createdAt: now }));
}

/** Resolve nome exibível a partir do id (+ customInstitutions / other). */
export function resolveInstitutionName(
  institutionId: string | undefined,
  institutionOther: string | undefined,
  institutions: Institution[],
): string | undefined {
  if (!institutionId) return undefined;
  if (institutionId === INSTITUTION_OTHER_ID) {
    return institutionOther?.trim() || "Outro";
  }
  const found = institutions.find((i) => i.id === institutionId);
  return found?.name ?? institutionOther?.trim();
}

/** Tenta casar texto livre (legado) com um seed por nome. */
export function matchInstitutionByName(
  raw: string | undefined,
  institutions: Institution[],
): { institutionId?: string; institutionOther?: string } {
  if (!raw?.trim()) return {};
  const n = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const aliases: Record<string, string> = {
    inter: "inst-inter",
    "banco inter": "inst-inter",
    nubank: "inst-nubank",
    nu: "inst-nubank",
    "mercado pago": "inst-mercado-pago",
    mercadopago: "inst-mercado-pago",
    picpay: "inst-picpay",
    "banco do brasil": "inst-bb",
    bb: "inst-bb",
    caixa: "inst-caixa",
    "caixa economica federal": "inst-caixa",
    "caixa econômica federal": "inst-caixa",
    swile: "inst-swile",
    swille: "inst-swile",
    itau: "inst-itau",
    "itau unibanco": "inst-itau",
    bradesco: "inst-bradesco",
    santander: "inst-santander",
    btg: "inst-btg",
    "btg pactual": "inst-btg",
    "c6": "inst-c6",
    "c6 bank": "inst-c6",
    next: "inst-next",
    pagbank: "inst-pagbank",
    pagseguro: "inst-pagbank",
    xp: "inst-xp",
    rico: "inst-rico",
    clear: "inst-clear",
    neon: "inst-neon",
    "will bank": "inst-will",
    will: "inst-will",
  };
  if (aliases[n]) return { institutionId: aliases[n] };
  const hit = institutions.find(
    (i) =>
      i.id !== INSTITUTION_OTHER_ID &&
      i.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase() === n,
  );
  if (hit) return { institutionId: hit.id };
  return { institutionId: INSTITUTION_OTHER_ID, institutionOther: raw.trim() };
}
