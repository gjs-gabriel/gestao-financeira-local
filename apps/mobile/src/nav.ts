export const APP_ROUTES = [
  { href: "/", title: "Painel", group: "Visão" },
  { href: "/fluxo", title: "Fluxo", group: "Visão" },
  { href: "/patrimonio", title: "Patrimônio", group: "Visão" },
  { href: "/relatorios", title: "Relatórios", group: "Visão" },
  { href: "/alertas", title: "Alertas", group: "Visão" },
  { href: "/contas", title: "Contas", group: "Movimento" },
  { href: "/cartoes", title: "Cartões", group: "Movimento" },
  { href: "/transferencias", title: "Transferências", group: "Movimento" },
  { href: "/rendas", title: "Rendas", group: "Movimento" },
  { href: "/gastos", title: "Gastos", group: "Movimento" },
  { href: "/assinaturas", title: "Assinaturas", group: "Movimento" },
  { href: "/orcamentos", title: "Orçamentos", group: "Movimento" },
  { href: "/aplicacoes", title: "Aplicações", group: "Patrimônio" },
  { href: "/dividas", title: "Dívidas", group: "Patrimônio" },
  { href: "/metas", title: "Metas", group: "Patrimônio" },
  { href: "/finn", title: "Finn", group: "Inteligência" },
  { href: "/analista", title: "Analista", group: "Inteligência" },
  { href: "/inteligencia", title: "Inteligência", group: "Inteligência" },
  { href: "/simulacao-compra", title: "Simular compra", group: "Inteligência" },
  { href: "/importar", title: "Importar", group: "Ferramentas" },
  { href: "/categorias", title: "Categorias", group: "Ferramentas" },
  { href: "/ia", title: "Assistente local", group: "Ferramentas" },
  { href: "/cofre", title: "Cofre", group: "Config" },
] as const;

/** Itens do menu Mais: sem Alertas (vão no header) e sem as 4 abas principais da barra. */
const TAB_HREFS = new Set([
  "/fluxo",
  "/patrimonio",
  "/relatorios",
  "/simulacao-compra",
  "/alertas",
]);

export const MAIS_ROUTES = APP_ROUTES.filter((r) => !TAB_HREFS.has(r.href));
