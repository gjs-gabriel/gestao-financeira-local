/**
 * Persona oficial de demonstração: Marina Costa.
 * Product Designer, 32 anos, São Paulo — ~12 meses de história financeira coerente.
 * Todos os nomes/instituições são fictícios.
 */

import { recordCardPurchase, payInvoice } from "./cards";
import { createTransfer } from "./ledger";
import { contributeToInvestment } from "./investments-ops";
import { createEmptySnapshot, upsertEntity, touchSnapshot } from "./snapshot";
import {
  upsertIncomeSynced,
  upsertInstallmentSynced,
  upsertInvestmentSynced,
  upsertOneTimeExpenseSynced,
  upsertOneTimeIncomeSynced,
  upsertRecurringExpenseSynced,
} from "./sync";
import { recordWealthSnapshot, wealthBreakdown } from "./wealth";
import type { VaultSnapshot, Institution, Category } from "./types";
import type { CreditCard } from "./ledger-types";
import type { Budget, CategorizationRule, WealthSnapshot } from "./v15-types";

/** Credenciais fixas do perfil de demonstração oficial.
 * NÃO é credencial de produção — apenas demo/seed local.
 * Não exibir em UI de produção; não tratar como segredo forte.
 */
export const MARINA_DEMO_PIN = "3247";
export const MARINA_DEMO_PROFILE_ID = "prof_marina_demo";
export const MARINA_DEMO_VAULT_ID = "vault_marina_demo";
export const MARINA_DEMO_USERNAME = "marina.demo";
export const MARINA_DEMO_DISPLAY_NAME = "Marina Costa";

export const MARINA_DEMO_CREDENTIALS = {
  name: MARINA_DEMO_DISPLAY_NAME,
  username: MARINA_DEMO_USERNAME,
  pin: MARINA_DEMO_PIN,
  persona: "32 anos · Product Designer · São Paulo/SP",
  summary: {
    rendaMensal: 9200,
    investimentos: 58000,
    reserva: 21000,
    divida: 31000,
    metaPrincipal: "Entrada do primeiro apartamento (R$ 120.000)",
  },
} as const;

const IDS = {
  instAurora: "inst_marina_aurora",
  instAtlas: "inst_marina_atlas",
  accCorrente: "acc_marina_corrente",
  accReserva: "acc_marina_reserva",
  accInvest: "acc_marina_invest",
  card: "card_marina_aurora",
  invRf: "inv_marina_rf",
  invFii: "inv_marina_fii",
  invEtf: "inv_marina_etf",
  invAcoes: "inv_marina_acoes",
  invPrev: "inv_marina_prev",
  invPoup: "inv_marina_poup",
  debtCar: "debt_marina_veiculo",
  goalApt: "goal_marina_apto",
  goalEmerg: "goal_marina_emergencia",
  goalTrip: "goal_marina_viagem",
  catViagens: "cat_marina_viagens",
  catCompras: "cat_marina_compras",
  catCasa: "cat_marina_casa",
  catFreelance: "cat_marina_freelance",
} as const;

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const d = new Date(y, m - 1 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function clampDay(y: number, m: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(y, m));
}

function monthLabel(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

type MonthCtx = {
  index: number; // 0 = mais antigo, 11 = atual
  y: number;
  m: number;
  key: string;
  salary: number;
  isTrip: boolean;
  isHealth: boolean;
  isNotebook: boolean;
  isFurnitureStart: boolean;
  freelance: number;
  aporteBoost: number;
};

function buildMonthPlan(anchor: Date): MonthCtx[] {
  const endY = anchor.getFullYear();
  const endM = anchor.getMonth() + 1;
  const months: MonthCtx[] = [];

  for (let i = 0; i < 12; i++) {
    const { y, m } = shiftMonth(endY, endM, i - 11);
    const index = i;
    // Salário: primeiros ~3 meses 8400, depois 8700, últimos ~6 meses 9200
    let salary = 8400;
    if (index >= 3) salary = 8700;
    if (index >= 6) salary = 9200;

    // Freelance por calendário (não todo mês)
    let freelance = 0;
    if (m === 11) freelance = 3000; // nov
    if (m === 3) freelance = 1800;
    if (m === 6) freelance = 2400;
    if (m === 8) freelance = 1200;

    months.push({
      index,
      y,
      m,
      key: monthLabel(y, m),
      salary,
      isTrip: index === 5, // ~mês 6 da jornada — Florianópolis
      isHealth: index === 2,
      isNotebook: index === 8, // compra notebook
      isFurnitureStart: index === 4,
      freelance,
      aporteBoost: index === 4 || index === 9 || index === 11 ? 1 : 0,
    });
  }
  return months;
}

/**
 * Snapshot completo da Marina — narrativa de ~12 meses.
 * Determinístico para o mesmo `anchor`.
 */
export function createMarinaDemoSnapshot(
  anchorInput: string | Date = new Date(),
): VaultSnapshot {
  const anchor =
    typeof anchorInput === "string" ? new Date(anchorInput) : anchorInput;
  const now = anchor.toISOString();
  const months = buildMonthPlan(anchor);
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const openingDate = ymd(first.y, first.m, 1);

  let s = createEmptySnapshot(now);

  // --- Instituições fictícias ---
  const aurora: Institution = {
    id: IDS.instAurora,
    name: "Banco Aurora",
    createdAt: now,
  };
  const atlas: Institution = {
    id: IDS.instAtlas,
    name: "Atlas Investimentos",
    createdAt: now,
  };
  s = upsertEntity(s, "institutions", aurora);
  s = upsertEntity(s, "institutions", atlas);

  // --- Categorias extras da persona ---
  const extraCats: Category[] = [
    {
      id: IDS.catViagens,
      name: "Viagens",
      kind: "expense",
      color: "#0EA5E9",
      createdAt: now,
    },
    {
      id: IDS.catCompras,
      name: "Compras",
      kind: "expense",
      color: "#A855F7",
      createdAt: now,
    },
    {
      id: IDS.catCasa,
      name: "Casa",
      kind: "expense",
      color: "#F59E0B",
      createdAt: now,
    },
    {
      id: IDS.catFreelance,
      name: "Freelance",
      kind: "income",
      color: "#10B981",
      createdAt: now,
    },
  ];
  for (const c of extraCats) s = upsertEntity(s, "categories", c);

  const cat = (id: string) => s.categories.find((c) => c.id === id)?.id;

  // --- Contas (saldos iniciais coerentes com início da jornada) ---
  s = {
    ...s,
    accounts: [],
  };
  s = upsertEntity(s, "accounts", {
    id: IDS.accCorrente,
    name: "Banco Aurora · Conta corrente",
    type: "checking",
    openingBalance: 28500,
    openingDate,
    currency: "BRL",
    status: "active",
    institutionId: IDS.instAurora,
    notes: "Conta do dia a dia — salário, contas e cartão",
    createdAt: now,
    updatedAt: now,
  });
  s = upsertEntity(s, "accounts", {
    id: IDS.accReserva,
    name: "Banco Aurora · Conta Reserva",
    type: "savings",
    openingBalance: 8500,
    openingDate,
    currency: "BRL",
    status: "active",
    institutionId: IDS.instAurora,
    notes: "Reserva de emergência / liquidez",
    createdAt: now,
    updatedAt: now,
  });
  s = upsertEntity(s, "accounts", {
    id: IDS.accInvest,
    name: "Atlas Investimentos · Conta",
    type: "investment_cash",
    openingBalance: 1800,
    openingDate,
    currency: "BRL",
    status: "active",
    institutionId: IDS.instAtlas,
    notes: "Conta para aportes e resgates",
    createdAt: now,
    updatedAt: now,
  });

  // --- Rendas recorrentes atuais (estado presente) ---
  s = upsertIncomeSynced(s, {
    id: "inc_marina_salario",
    type: "salary",
    name: "Salário · PixelCraft Studio",
    amount: 9200,
    dayOfMonth: 5,
    institutionId: IDS.instAurora,
    notes: "Product Designer · líquido",
    createdAt: now,
    updatedAt: now,
  });
  s = upsertIncomeSynced(s, {
    id: "inc_marina_va",
    type: "va",
    name: "Vale alimentação",
    amount: 900,
    dayOfMonth: 1,
    notes: "Benefício mensal",
    createdAt: now,
    updatedAt: now,
  });
  s = upsertIncomeSynced(s, {
    id: "inc_marina_vr",
    type: "vr",
    name: "Vale refeição",
    amount: 600,
    dayOfMonth: 1,
    createdAt: now,
    updatedAt: now,
  });

  // --- Despesas recorrentes ---
  const recurrings: {
    id: string;
    name: string;
    amount: number;
    cat: string;
    day?: number;
  }[] = [
    { id: "rex_marina_aluguel", name: "Aluguel · Vila Mariana", amount: 2600, cat: "cat-moradia" },
    { id: "rex_marina_cond", name: "Condomínio", amount: 550, cat: "cat-moradia" },
    { id: "rex_marina_net", name: "Internet fibra", amount: 120, cat: "cat-assinaturas" },
    { id: "rex_marina_cel", name: "Celular", amount: 90, cat: "cat-assinaturas" },
    { id: "rex_marina_academia", name: "Academia MoveSP", amount: 140, cat: "cat-saude" },
    { id: "rex_marina_stream", name: "Streaming + música", amount: 82, cat: "cat-assinaturas" },
    { id: "rex_marina_cloud", name: "Armazenamento nuvem", amount: 15, cat: "cat-assinaturas" },
    { id: "rex_marina_figma", name: "Software de design", amount: 120, cat: "cat-assinaturas" },
    { id: "rex_marina_seguro", name: "Seguro residencial", amount: 180, cat: "cat-moradia" },
    { id: "rex_marina_finan", name: "Financiamento veículo", amount: 1180, cat: "cat-transporte" },
  ];
  for (const r of recurrings) {
    s = upsertRecurringExpenseSynced(s, {
      id: r.id,
      name: r.name,
      amount: r.amount,
      frequency: "monthly",
      categoryId: cat(r.cat),
      institutionId: IDS.instAurora,
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- Cartão ---
  const card: CreditCard = {
    id: IDS.card,
    name: "Aurora Platinum",
    limit: 15000,
    closingDay: 6,
    dueDay: 14,
    paymentAccountId: IDS.accCorrente,
    status: "active",
    institutionId: IDS.instAurora,
    notes: "Cartão principal · supermercado, apps, viagens",
    createdAt: now,
    updatedAt: now,
  };
  s = upsertEntity(s, "creditCards", card);

  // --- Investimentos: começar baixo e aportar até ~58k ---
  // Valores iniciais (~12k total) depois aportes mensais
  const startInv = {
    rf: 7000,
    fii: 2000,
    etf: 1500,
    acoes: 800,
    prev: 500,
    poup: 200,
  };
  s = upsertInvestmentSynced(s, {
    id: IDS.invRf,
    name: "CDB / Tesouro Selic · liquidez",
    amount: startInv.rf,
    classification: "renda_fixa",
    institutionId: IDS.instAtlas,
    categoryId: cat("cat-renda-fixa"),
    notes: "Base da reserva e entrada do apto",
    createdAt: now,
    updatedAt: now,
  });
  s = upsertInvestmentSynced(s, {
    id: IDS.invFii,
    name: "FIIs · carteira inicial",
    amount: startInv.fii,
    classification: "fiis",
    institutionId: IDS.instAtlas,
    categoryId: cat("cat-fiis"),
    createdAt: now,
    updatedAt: now,
  });
  s = upsertInvestmentSynced(s, {
    id: IDS.invEtf,
    name: "ETF BOVA11 / IVVB11",
    amount: startInv.etf,
    classification: "etfs",
    institutionId: IDS.instAtlas,
    categoryId: cat("cat-etfs"),
    createdAt: now,
    updatedAt: now,
  });
  s = upsertInvestmentSynced(s, {
    id: IDS.invAcoes,
    name: "Ações · aprendizado",
    amount: startInv.acoes,
    classification: "acoes",
    institutionId: IDS.instAtlas,
    categoryId: cat("cat-acoes"),
    notes: "Posição pequena — Marina ainda está aprendendo",
    createdAt: now,
    updatedAt: now,
  });
  s = upsertInvestmentSynced(s, {
    id: IDS.invPrev,
    name: "Previdência VGBL",
    amount: startInv.prev,
    classification: "previdencia",
    institutionId: IDS.instAtlas,
    createdAt: now,
    updatedAt: now,
  });
  s = upsertInvestmentSynced(s, {
    id: IDS.invPoup,
    name: "Poupança Atlas",
    amount: startInv.poup,
    classification: "poupanca",
    institutionId: IDS.instAtlas,
    createdAt: now,
    updatedAt: now,
  });

  // Dívida — saldo atual; pagamentos mensais via recorrente
  s = upsertEntity(s, "debts", {
    id: IDS.debtCar,
    name: "Financiamento veículo · Compra 2024",
    balance: 31000,
    originalAmount: 52000,
    installmentAmount: 1180,
    remainingInstallments: 28,
    interestRate: 19.9,
    dueDate: ymd(last.y, last.m, 10),
    notes: "Saldo reduzindo mês a mês · dia 10",
    createdAt: now,
    updatedAt: now,
  });

  // Metas
  s = upsertEntity(s, "goals", {
    id: IDS.goalApt,
    name: "Entrada do apartamento",
    targetAmount: 120000,
    currentAmount: 38000,
    deadline: ymd(last.y + 4, last.m, 1),
    notes:
      "Objetivo principal · combinar aportes, renda fixa, bônus e freelance",
    createdAt: now,
    updatedAt: now,
  });
  {
    const dEmerg = shiftMonth(last.y, last.m, 12);
    s = upsertEntity(s, "goals", {
      id: IDS.goalEmerg,
      name: "Reserva de emergência",
      targetAmount: 30000,
      currentAmount: 21000,
      deadline: ymd(dEmerg.y, dEmerg.m, 1),
      notes: "Quase lá · liquidez na Conta Reserva + RF",
      createdAt: now,
      updatedAt: now,
    });
  }
  {
    const dTrip = shiftMonth(last.y, last.m, 18);
    s = upsertEntity(s, "goals", {
      id: IDS.goalTrip,
      name: "Viagem internacional",
      targetAmount: 15000,
      currentAmount: 4500,
      deadline: ymd(dTrip.y, dTrip.m, 15),
      notes: "Europa · ainda no começo",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Orçamentos do mês atual
  const periodKey = last.key;
  const budgets: Budget[] = [
    {
      id: "bud_marina_ali",
      name: "Alimentação",
      categoryId: cat("cat-alimentacao")!,
      limitAmount: 1500,
      periodKey,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bud_marina_trans",
      name: "Transporte",
      categoryId: cat("cat-transporte")!,
      limitAmount: 800,
      periodKey,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bud_marina_laz",
      name: "Lazer",
      categoryId: cat("cat-lazer")!,
      limitAmount: 600,
      periodKey,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bud_marina_compras",
      name: "Compras",
      categoryId: IDS.catCompras,
      limitAmount: 700,
      periodKey,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bud_marina_casa",
      name: "Casa",
      categoryId: IDS.catCasa,
      limitAmount: 500,
      periodKey,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bud_marina_ass",
      name: "Assinaturas",
      categoryId: cat("cat-assinaturas")!,
      limitAmount: 350,
      periodKey,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const b of budgets) s = upsertEntity(s, "budgets", b);

  s = upsertEntity(s, "categorizationRules", {
    id: "rule_marina_ifood",
    name: "Delivery / iFood",
    contains: "iFood",
    matchField: "description",
    categoryId: cat("cat-alimentacao")!,
    priority: 5,
    active: true,
    createdAt: now,
    updatedAt: now,
  } satisfies CategorizationRule);

  // Parcelas: móveis (mês 4), viagem (mês 5), notebook (mês 8)
  const furnitureMonth = months.find((x) => x.isFurnitureStart)!;
  s = upsertInstallmentSynced(s, {
    id: "px_marina_moveis",
    name: "Móveis · apartamento alugado",
    installmentAmount: 450,
    totalInstallments: 8,
    startDate: ymd(furnitureMonth.y, furnitureMonth.m, 18),
    categoryId: IDS.catCasa,
    institutionId: IDS.instAurora,
    notes: "8x · sofá e mesa",
    createdAt: now,
    updatedAt: now,
  });

  const tripMonth = months.find((x) => x.isTrip)!;
  s = upsertInstallmentSynced(s, {
    id: "px_marina_floripa",
    name: "Viagem Florianópolis",
    installmentAmount: 800,
    totalInstallments: 6,
    startDate: ymd(tripMonth.y, tripMonth.m, 20),
    categoryId: IDS.catViagens,
    institutionId: IDS.instAurora,
    notes: "Hospedagem + passeios parcelados · R$ 4.800",
    createdAt: now,
    updatedAt: now,
  });

  const nbMonth = months.find((x) => x.isNotebook)!;
  s = upsertInstallmentSynced(s, {
    id: "px_marina_notebook",
    name: "Notebook trabalho · Design",
    installmentAmount: 600,
    totalInstallments: 12,
    startDate: ymd(nbMonth.y, nbMonth.m, 12),
    categoryId: IDS.catCompras,
    institutionId: IDS.instAurora,
    notes: "R$ 7.200 em 12x · ferramenta de trabalho",
    createdAt: now,
    updatedAt: now,
  });

  // --- Loop histórico mensal ---
  const wealthPoints: WealthSnapshot[] = [];

  for (const mo of months) {
    const salaryDate = ymd(mo.y, mo.m, 5);
    const isPastOrCurrent = mo.index < 11 || true;

    // Salário histórico como pontual quando diferente do recorrente atual
    // (recorrente já conta 9200 no cashflow; para meses passados com salário menor,
    // registramos ajuste negativo? Melhor: incomes recorrentes só refletem presente;
    // histórico de salário via oneTimeIncome + não duplicar no mês atual via...
    // monthlyCashflow soma incomes (recorrentes) + oneTime.
    // Então para histórico usamos oneTimeIncome para o salário de cada mês E
    // removemos a renda recorrente do cálculo histórico... Problemático.
    //
    // Abordagem: manter incomes = salário atual 9200 (para projeção futura).
    // Para meses passados com salário menor, o gráfico usará 9200 + extras —
    // ligeiramente impreciso. Alternativa: incomes vazio e só oneTime por mês.
    //
    // Melhor para storytelling: incomes = valores atuais (projeção), e
    // oneTimeIncome nos meses passados com o salário da época; no mês atual
    // NÃO lançar oneTime de salário (só recorrente).
    // Cashflow do mês passado = recorrente 9200 + oneTime salário antigo = DOBRO.
    //
    // Solução correta: não usar Income recorrente para salário histórico;
    // usar Income recorrente só para VA/VR e salário atual; para meses
    // anteriores ao reajuste final, lançar oneTimeExpense? Não.
    //
    // Usar apenas oneTimeIncome para TODOS os salários históricos incluindo
    // mês atual, e Income recorrente amount 0? Dirty.
    //
    // Prático: incomes salário 9200 para futuro; para meses index < 11,
    // adicionar oneTimeIncome negativo? Domain may not allow.
    //
    // Simplificação aceita no domínio atual:
    // - Recorrente = salário ATUAL (9200) + VA + VR
    // - Histórico de variação aparece via freelas e gastos
    // - oneTimeIncome só freelas
    // Evolução salarial fica implícita na narrativa/docs; freelas e aportes
    // mostram variação no fluxo.
    //
    // Para mostrar evolução no fluxo: nos meses com salário 8400/8700,
    // lançar oneTimeExpense "ajuste demonstração" — ruim.
    //
    // Ideal: set incomes salary to 0 and put all 12 salaries as oneTimeIncome.
    // Projeção futura: projectedCashflow uses recurring incomes — would miss salary.
    //
    // Compromise: keep recurring 9200; add note. Freelance + trip create visible spikes.

    if (mo.freelance > 0) {
      s = upsertOneTimeIncomeSynced(s, {
        id: `oti_marina_fl_${mo.key}`,
        name: `Freelance design · ${mo.key}`,
        amount: mo.freelance,
        date: ymd(mo.y, mo.m, clampDay(mo.y, mo.m, 22)),
        categoryId: IDS.catFreelance,
        notes: "Trabalho pontual · Product Design",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Créditos na conta corrente (ledger) — salário/benefícios do mês.
    // Rendas recorrentes alimentam o fluxo; estas txs alimentam o saldo da conta.
    s = upsertEntity(s, "transactions", {
      id: `tx_marina_sal_${mo.key}`,
      kind: "income",
      date: ymd(mo.y, mo.m, 5),
      amount: mo.salary,
      description: "Salário · PixelCraft Studio",
      accountId: IDS.accCorrente,
      status: "confirmed",
      source: "system",
      createdAt: now,
      updatedAt: now,
    });
    s = upsertEntity(s, "transactions", {
      id: `tx_marina_va_${mo.key}`,
      kind: "income",
      date: ymd(mo.y, mo.m, 1),
      amount: 900,
      description: "Vale alimentação",
      accountId: IDS.accCorrente,
      status: "confirmed",
      source: "system",
      createdAt: now,
      updatedAt: now,
    });
    s = upsertEntity(s, "transactions", {
      id: `tx_marina_vr_${mo.key}`,
      kind: "income",
      date: ymd(mo.y, mo.m, 1),
      amount: 600,
      description: "Vale refeição",
      accountId: IDS.accCorrente,
      status: "confirmed",
      source: "system",
      createdAt: now,
      updatedAt: now,
    });

    // Debita despesas fixas na conta (espelho das recorrências no ledger)
    const fixedDebits: { id: string; day: number; amount: number; name: string; cat?: string }[] = [
      { id: "aluguel", day: 7, amount: 2600, name: "Aluguel · Vila Mariana", cat: "cat-moradia" },
      { id: "cond", day: 7, amount: 550, name: "Condomínio", cat: "cat-moradia" },
      { id: "finan", day: 10, amount: 1180, name: "Financiamento veículo", cat: "cat-transporte" },
      { id: "net", day: 8, amount: 120, name: "Internet fibra", cat: "cat-assinaturas" },
      { id: "cel", day: 8, amount: 90, name: "Celular", cat: "cat-assinaturas" },
      { id: "acad", day: 25, amount: 140, name: "Academia MoveSP", cat: "cat-saude" },
      { id: "stream", day: 5, amount: 82, name: "Streaming + música", cat: "cat-assinaturas" },
      { id: "cloud", day: 5, amount: 15, name: "Armazenamento nuvem", cat: "cat-assinaturas" },
      { id: "figma", day: 5, amount: 120, name: "Software de design", cat: "cat-assinaturas" },
      { id: "seguro", day: 12, amount: 180, name: "Seguro residencial", cat: "cat-moradia" },
    ];
    for (const fd of fixedDebits) {
      s = upsertEntity(s, "transactions", {
        id: `tx_marina_${fd.id}_${mo.key}`,
        kind: "expense",
        date: ymd(mo.y, mo.m, clampDay(mo.y, mo.m, fd.day)),
        amount: fd.amount,
        description: fd.name,
        accountId: IDS.accCorrente,
        categoryId: fd.cat ? cat(fd.cat) : undefined,
        status: "confirmed",
        source: "system",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Energia variável
    const energia = 160 + (mo.index % 4) * 25 + (mo.isTrip ? 40 : 0);
    s = upsertOneTimeExpenseSynced(s, {
      id: `otx_marina_energia_${mo.key}`,
      name: "Conta de energia",
      amount: Math.round(energia * 100) / 100,
      date: ymd(mo.y, mo.m, 12),
      categoryId: cat("cat-moradia"),
      createdAt: now,
      updatedAt: now,
    });

    // Alimentação variável (mercado + restaurantes + café)
    let alimentacaoExtra = 380 + (mo.index % 3) * 40;
    if (mo.isTrip) alimentacaoExtra += 900;
    s = upsertOneTimeExpenseSynced(s, {
      id: `otx_marina_mercado_${mo.key}`,
      name: "Supermercado Aurora Market",
      amount: Math.round((420 + (mo.index % 5) * 35) * 100) / 100,
      date: ymd(mo.y, mo.m, 8),
      categoryId: cat("cat-alimentacao"),
      createdAt: now,
      updatedAt: now,
    });
    s = upsertOneTimeExpenseSynced(s, {
      id: `otx_marina_rest_${mo.key}`,
      name: mo.isTrip
        ? "Restaurantes · Florianópolis"
        : "Restaurantes e cafés",
      amount: Math.round(alimentacaoExtra * 100) / 100,
      date: ymd(mo.y, mo.m, clampDay(mo.y, mo.m, mo.isTrip ? 16 : 19)),
      categoryId: cat("cat-alimentacao"),
      createdAt: now,
      updatedAt: now,
    });

    // Transporte
    let transporte = 220 + (mo.index % 4) * 30;
    if (mo.isTrip) transporte += 480;
    // Mês atual: próximo do limite do orçamento (800) via recorrente financiamento
    // + variáveis — o orçamento de transporte conta só expenses por categoria
    s = upsertOneTimeExpenseSynced(s, {
      id: `otx_marina_uber_${mo.key}`,
      name: mo.isTrip ? "Uber / deslocamentos viagem" : "Uber e transporte app",
      amount: Math.round(transporte * 100) / 100,
      date: ymd(mo.y, mo.m, 15),
      categoryId: cat("cat-transporte"),
      createdAt: now,
      updatedAt: now,
    });

    // Lazer
    let lazer = 180 + (mo.index % 3) * 50;
    if (mo.isTrip) lazer += 700; // estoura orçamento no mês da viagem
    if (mo.index === 11) lazer = 420; // mês atual sob controle
    s = upsertOneTimeExpenseSynced(s, {
      id: `otx_marina_lazer_${mo.key}`,
      name: mo.isTrip ? "Passeios e lazer · Floripa" : "Cinema, cafés e lazer",
      amount: Math.round(lazer * 100) / 100,
      date: ymd(mo.y, mo.m, 21),
      categoryId: cat("cat-lazer"),
      createdAt: now,
      updatedAt: now,
    });

    // Saúde
    if (mo.isHealth) {
      s = upsertOneTimeExpenseSynced(s, {
        id: `otx_marina_saude_${mo.key}`,
        name: "Consultas e exames · check-up",
        amount: 980,
        date: ymd(mo.y, mo.m, 9),
        categoryId: cat("cat-saude"),
        notes: "Mês com gasto maior em saúde",
        createdAt: now,
        updatedAt: now,
      });
    } else if (mo.index % 3 === 1) {
      s = upsertOneTimeExpenseSynced(s, {
        id: `otx_marina_farm_${mo.key}`,
        name: "Farmácia",
        amount: 95 + mo.index * 3,
        date: ymd(mo.y, mo.m, 17),
        categoryId: cat("cat-saude"),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Casa / compras
    if (!mo.isTrip) {
      s = upsertOneTimeExpenseSynced(s, {
        id: `otx_marina_casa_${mo.key}`,
        name: "Itens de casa e limpeza",
        amount: 85 + (mo.index % 4) * 20,
        date: ymd(mo.y, mo.m, 11),
        categoryId: IDS.catCasa,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (mo.isTrip) {
      s = upsertOneTimeExpenseSynced(s, {
        id: `otx_marina_passagem_${mo.key}`,
        name: "Passagens aéreas · Florianópolis",
        amount: 1100,
        date: ymd(mo.y, mo.m, 3),
        categoryId: IDS.catViagens,
        notes: "Ida e volta · parte à vista",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Cartão — compras do mês (fatura ~2.5k–4k, viagem ~6.8k)
    const cardBase = mo.isTrip
      ? 6800
      : mo.isNotebook
        ? 4200
        : 2500 + (mo.index % 5) * 280 + (mo.index === 11 ? 200 : 0);

    const cardParts: { desc: string; amount: number; catId?: string; day: number }[] =
      mo.isTrip
        ? [
            {
              desc: "Hotel / Airbnb Floripa",
              amount: 2200,
              catId: IDS.catViagens,
              day: 14,
            },
            {
              desc: "Restaurantes viagem",
              amount: 1450,
              catId: cat("cat-alimentacao"),
              day: 15,
            },
            {
              desc: "Passeios e ingressos",
              amount: 980,
              catId: cat("cat-lazer"),
              day: 16,
            },
            {
              desc: "iFood e apps",
              amount: 620,
              catId: cat("cat-alimentacao"),
              day: 18,
            },
            {
              desc: "Compras viagem",
              amount: 1550,
              catId: IDS.catCompras,
              day: 17,
            },
          ]
        : [
            {
              desc: "Supermercado cartão",
              amount: Math.round(cardBase * 0.35),
              catId: cat("cat-alimentacao"),
              day: 9,
            },
            {
              desc: "iFood / delivery",
              amount: Math.round(cardBase * 0.18),
              catId: cat("cat-alimentacao"),
              day: 13,
            },
            {
              desc: "Apps e assinaturas avulsas",
              amount: Math.round(cardBase * 0.12),
              catId: cat("cat-assinaturas"),
              day: 4,
            },
            {
              desc: "Compras online",
              amount: Math.round(cardBase * 0.2),
              catId: IDS.catCompras,
              day: 22,
            },
            {
              desc: "Farmácia / saúde cartão",
              amount: Math.round(cardBase * 0.15),
              catId: cat("cat-saude"),
              day: 25,
            },
          ];

    // Ajuste para somar ~cardBase
    const sumParts = cardParts.reduce((a, p) => a + p.amount, 0);
    if (sumParts > 0 && Math.abs(sumParts - cardBase) > 1) {
      cardParts[0]!.amount += Math.round(cardBase - sumParts);
    }

    for (const [pi, p] of cardParts.entries()) {
      if (p.amount <= 0) continue;
      s = recordCardPurchase(s, {
        cardId: IDS.card,
        amount: p.amount,
        date: ymd(mo.y, mo.m, clampDay(mo.y, mo.m, p.day)),
        description: p.desc,
        categoryId: p.catId,
        notes: mo.isTrip ? "Mês da viagem Florianópolis" : undefined,
      });
      // IDs estáveis via rewrite after? recordCardPurchase uses createId —
      // ok for uniqueness; idempotency is at profile level.
      void pi;
    }

    // Pagar faturas de meses anteriores (não a fatura ainda aberta do mês atual)
    if (mo.index < 11) {
      const openInvs = (s.invoices ?? []).filter(
        (inv) =>
          inv.creditCardId === IDS.card &&
          inv.status !== "paid" &&
          inv.periodKey < last.key,
      );
      for (const inv of openInvs) {
        try {
          s = payInvoice(s, inv.id, {
            accountId: IDS.accCorrente,
            date: inv.dueDate,
          });
        } catch {
          /* ignore */
        }
      }
    }

    // Transferência para reserva (dia 20) — construir emergência
    const reservaAporte =
      mo.index < 3 ? 800 : mo.index < 8 ? 1000 : 1200;
    const transferReserva = createTransfer({
      id: `tx_marina_res_${mo.key}`,
      fromAccountId: IDS.accCorrente,
      toAccountId: IDS.accReserva,
      amount: reservaAporte,
      date: ymd(mo.y, mo.m, 20),
      description: "Aporte reserva de emergência",
      now,
    });
    s = upsertEntity(s, "transactions", transferReserva);

    // Aportes em investimentos (dia 20 também, via conta invest)
    // Primeiro move corrente → invest, depois contribute
    let aporteTotal = 1400 + mo.aporteBoost * 1200;
    if (mo.freelance > 0) aporteTotal += Math.round(mo.freelance * 0.4);
    if (mo.isTrip) aporteTotal = Math.max(600, aporteTotal - 1000);

    const toInvest = createTransfer({
      id: `tx_marina_toinv_${mo.key}`,
      fromAccountId: IDS.accCorrente,
      toAccountId: IDS.accInvest,
      amount: aporteTotal,
      date: ymd(mo.y, mo.m, 20),
      description: "Transferência para investimentos",
      now,
    });
    s = upsertEntity(s, "transactions", toInvest);

    // Distribuição do aporte (conservadora)
    const parts = [
      { id: IDS.invRf, pct: 0.5 },
      { id: IDS.invFii, pct: 0.18 },
      { id: IDS.invEtf, pct: 0.14 },
      { id: IDS.invAcoes, pct: 0.1 },
      { id: IDS.invPrev, pct: 0.06 },
      { id: IDS.invPoup, pct: 0.02 },
    ];
    for (const [qi, part] of parts.entries()) {
      const amt = Math.round(aporteTotal * part.pct * 100) / 100;
      if (amt < 1) continue;
      s = contributeToInvestment(s, {
        investmentId: part.id,
        amount: amt,
        date: ymd(mo.y, mo.m, 20),
        accountId: IDS.accInvest,
        description: `Aporte mensal · ${mo.key}`,
      });
      void qi;
    }

    // Snapshot de PL aproximado ao fim do mês (será recalculado no fim)
    void isPastOrCurrent;
    void salaryDate;
  }

  // Ajustar saldos finais de investimentos para ~58k se necessário (rendimento implícito)
  const targetInv: Record<string, number> = {
    [IDS.invRf]: 32000,
    [IDS.invFii]: 8500,
    [IDS.invEtf]: 6500,
    [IDS.invAcoes]: 5000,
    [IDS.invPrev]: 4000,
    [IDS.invPoup]: 2000,
  };
  for (const inv of s.investments) {
    const target = targetInv[inv.id];
    if (target != null && Math.abs(inv.amount - target) > 50) {
      s = upsertInvestmentSynced(s, {
        ...inv,
        amount: target,
        updatedAt: now,
        notes: inv.notes
          ? `${inv.notes} · posição atual após aportes e rendimento`
          : "Posição atual após aportes e rendimento",
      });
    }
  }

  // Ajustar Conta Reserva ~21k via opening + transfers; se faltar, adjustment
  // (accountBalance = opening + txs). Deixamos o fluxo falar.

  // Fechar faturas antigas restantes
  for (const inv of [...(s.invoices ?? [])]) {
    if (
      inv.creditCardId === IDS.card &&
      inv.status !== "paid" &&
      inv.periodKey < last.key
    ) {
      try {
        s = payInvoice(s, inv.id, {
          accountId: IDS.accCorrente,
          date: inv.dueDate,
        });
      } catch {
        /* */
      }
    }
  }

  // Wealth history mês a mês (recalcula breakdown progressivo aproximado)
  // Registra pontos sintéticos crescentes + ponto final real
  for (let i = 0; i < months.length; i++) {
    const mo = months[i]!;
    const progress = (i + 1) / 12;
    const approxAssets = 28000 + progress * 55000;
    const approxLiab = 45000 - progress * 12000;
    wealthPoints.push({
      periodKey: mo.key,
      date: ymd(mo.y, mo.m, clampDay(mo.y, mo.m, 28)),
      assets: Math.round(approxAssets),
      liabilities: Math.round(approxLiab),
      netWorth: Math.round(approxAssets - approxLiab),
    });
  }
  s = { ...s, wealthHistory: wealthPoints };
  s = recordWealthSnapshot(s, anchor);

  // Notas no snapshot via touch
  s = touchSnapshot(s, {
    updatedAt: now,
  });

  return s;
}

export function isMarinaDemoSnapshot(snapshot: VaultSnapshot): boolean {
  return (
    snapshot.accounts.some((a) => a.id.startsWith("acc_marina_")) ||
    snapshot.goals.some((g) => g.id === IDS.goalApt)
  );
}

export function validateMarinaDemoSnapshot(snapshot: VaultSnapshot): {
  ok: boolean;
  issues: string[];
  breakdown: ReturnType<typeof wealthBreakdown>;
} {
  const issues: string[] = [];
  if (!isMarinaDemoSnapshot(snapshot)) {
    issues.push("Snapshot não parece ser o da Marina");
  }
  if (snapshot.investments.reduce((a, i) => a + i.amount, 0) < 50000) {
    issues.push("Investimentos abaixo do esperado (~58k)");
  }
  if (!snapshot.goals.some((g) => g.id === IDS.goalApt && g.currentAmount >= 35000)) {
    issues.push("Meta do apartamento ausente ou baixa");
  }
  if (!snapshot.debts.some((d) => d.id === IDS.debtCar)) {
    issues.push("Financiamento ausente");
  }
  if ((snapshot.creditCards ?? []).length < 1) {
    issues.push("Cartão ausente");
  }
  if ((snapshot.oneTimeExpenses ?? []).length < 20) {
    issues.push("Histórico de gastos curto demais");
  }
  const breakdown = wealthBreakdown(snapshot);
  return { ok: issues.length === 0, issues, breakdown };
}

export function formatMarinaCredentialsBanner(): string {
  const c = MARINA_DEMO_CREDENTIALS;
  return `
============================================
PERFIL DE DEMONSTRAÇÃO
============================================

Nome:
${c.name}

Usuário:
${c.username}

PIN:
${c.pin}

Persona:
${c.persona}

Resumo:
Renda mensal ≈ R$ ${c.summary.rendaMensal.toLocaleString("pt-BR")}
Investimentos ≈ R$ ${c.summary.investimentos.toLocaleString("pt-BR")}
Reserva ≈ R$ ${c.summary.reserva.toLocaleString("pt-BR")}
Dívida ≈ R$ ${c.summary.divida.toLocaleString("pt-BR")}
Meta principal: ${c.summary.metaPrincipal}

============================================
`.trim();
}
