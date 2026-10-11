/**
 * Mapa estático Pluggy category (string) → categoryId dos seeds do app.
 * Chaves em minúsculas; lookup normaliza acentos e espaços.
 */

const EXACT: Record<string, string> = {
  // Alimentação
  restaurants: "cat-alimentacao",
  restaurant: "cat-alimentacao",
  "food and drink": "cat-alimentacao",
  food: "cat-alimentacao",
  groceries: "cat-alimentacao",
  supermarket: "cat-alimentacao",
  alimentacao: "cat-alimentacao",
  alimentação: "cat-alimentacao",
  restaurante: "cat-alimentacao",
  mercado: "cat-alimentacao",

  // Transporte
  transportation: "cat-transporte",
  transport: "cat-transporte",
  taxi: "cat-transporte",
  "gas stations": "cat-transporte",
  automotive: "cat-transporte",
  transporte: "cat-transporte",
  combustivel: "cat-transporte",
  combustível: "cat-transporte",
  uber: "cat-transporte",

  // Moradia
  housing: "cat-moradia",
  rent: "cat-moradia",
  utilities: "cat-moradia",
  moradia: "cat-moradia",
  aluguel: "cat-moradia",
  "contas da casa": "cat-moradia",

  // Saúde
  healthcare: "cat-saude",
  health: "cat-saude",
  pharmacy: "cat-saude",
  saude: "cat-saude",
  saúde: "cat-saude",
  farmacia: "cat-saude",
  farmácia: "cat-saude",

  // Lazer
  entertainment: "cat-lazer",
  leisure: "cat-lazer",
  recreation: "cat-lazer",
  travel: "cat-lazer",
  lazer: "cat-lazer",
  viagem: "cat-lazer",

  // Educação
  education: "cat-educacao",
  educacao: "cat-educacao",
  educação: "cat-educacao",

  // Assinaturas
  subscriptions: "cat-assinaturas",
  subscription: "cat-assinaturas",
  digital: "cat-assinaturas",
  assinaturas: "cat-assinaturas",
  streaming: "cat-assinaturas",

  // Renda
  income: "cat-salario",
  salary: "cat-salario",
  wages: "cat-salario",
  salario: "cat-salario",
  salário: "cat-salario",
  transfer: "cat-renda-extra",
  transfers: "cat-renda-extra",
  "bank fees": "cat-outros",
  taxes: "cat-outros",
  other: "cat-outros",
  others: "cat-outros",
  outros: "cat-outros",
};

function normalizeKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Resolve categoryId do app a partir do campo `category` da Pluggy. */
export function mapPluggyCategoryToId(
  category: string | null | undefined,
): string | undefined {
  if (!category) return undefined;
  const key = normalizeKey(category);
  if (EXACT[key]) return EXACT[key];

  // Match parcial por palavra-chave.
  if (key.includes("restaurant") || key.includes("food") || key.includes("aliment")) {
    return "cat-alimentacao";
  }
  if (key.includes("transport") || key.includes("uber") || key.includes("gas")) {
    return "cat-transporte";
  }
  if (key.includes("health") || key.includes("saude") || key.includes("pharma")) {
    return "cat-saude";
  }
  if (key.includes("rent") || key.includes("hous") || key.includes("moradia")) {
    return "cat-moradia";
  }
  if (key.includes("educ")) return "cat-educacao";
  if (key.includes("leisure") || key.includes("entertain") || key.includes("lazer")) {
    return "cat-lazer";
  }
  if (key.includes("subscri") || key.includes("stream")) return "cat-assinaturas";
  if (key.includes("salary") || key.includes("salario") || key.includes("income")) {
    return "cat-salario";
  }
  return "cat-outros";
}
