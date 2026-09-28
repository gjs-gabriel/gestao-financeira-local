import type { Category } from "./types";

/** Seeds iniciais de categorias (pt-BR). IDs estáveis para facilitar migração. */
export const SEED_CATEGORIES: Omit<Category, "createdAt">[] = [
  { id: "cat-salario", name: "Salário", kind: "income", color: "#0F766E" },
  { id: "cat-beneficios", name: "Benefícios (VR/VA)", kind: "income", color: "#0D9488" },
  { id: "cat-renda-extra", name: "Renda extra", kind: "income", color: "#14B8A6" },
  { id: "cat-renda-fixa", name: "Renda fixa", kind: "investment", color: "#1D4ED8" },
  { id: "cat-acoes", name: "Ações", kind: "investment", color: "#2563EB" },
  { id: "cat-fiis", name: "FIIs", kind: "investment", color: "#3B82F6" },
  { id: "cat-etfs", name: "ETFs", kind: "investment", color: "#60A5FA" },
  { id: "cat-moradia", name: "Moradia", kind: "expense", color: "#B45309" },
  { id: "cat-alimentacao", name: "Alimentação", kind: "expense", color: "#D97706" },
  { id: "cat-transporte", name: "Transporte", kind: "expense", color: "#EA580C" },
  { id: "cat-saude", name: "Saúde", kind: "expense", color: "#DC2626" },
  { id: "cat-lazer", name: "Lazer", kind: "expense", color: "#C2410C" },
  { id: "cat-educacao", name: "Educação", kind: "expense", color: "#9A3412" },
  { id: "cat-assinaturas", name: "Assinaturas", kind: "expense", color: "#78716C" },
  { id: "cat-outros", name: "Outros", kind: "general", color: "#57534E" },
];

export function createSeedCategories(now = new Date().toISOString()): Category[] {
  return SEED_CATEGORIES.map((c) => ({ ...c, createdAt: now }));
}
