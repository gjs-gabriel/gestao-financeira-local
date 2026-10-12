"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Receipt,
  CreditCard,
  Target,
  Tags,
  Lock,
  Menu,
  ArrowLeftRight,
  FileUp,
  Landmark,
  Repeat,
  PiggyBank,
  Bell,
  ScrollText,
  ArrowRightLeft,
  Wand2,
  PieChart,
  FileBarChart,
  Brain,
  Sparkles,
  Users,
  Shield,
  ShoppingBag,
  Bot,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useVault } from "@/lib/vault-context";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Visão",
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard },
      { href: "/fluxo", label: "Fluxo", icon: ArrowLeftRight },
      { href: "/patrimonio", label: "Patrimônio", icon: PieChart },
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
      { href: "/alertas", label: "Alertas", icon: Bell },
    ],
  },
  {
    title: "Movimento",
    items: [
      { href: "/contas", label: "Contas", icon: Landmark },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
      { href: "/transferencias", label: "Transferir", icon: ArrowRightLeft },
      { href: "/rendas", label: "Rendas", icon: Wallet },
      { href: "/gastos", label: "Gastos", icon: Receipt },
      { href: "/assinaturas", label: "Assinaturas", icon: Repeat },
      { href: "/orcamentos", label: "Orçamentos", icon: PiggyBank },
    ],
  },
  {
    title: "Patrimônio",
    items: [
      { href: "/aplicacoes", label: "Aplicações", icon: TrendingUp },
      { href: "/dividas", label: "Dívidas", icon: ScrollText },
      { href: "/metas", label: "Metas", icon: Target },
    ],
  },
  {
    title: "Ferramentas",
    items: [
      { href: "/finn", label: "Finn", icon: MessageSquare },
      { href: "/analista", label: "Analista", icon: Sparkles },
      { href: "/inteligencia", label: "Inteligência", icon: Brain },
      { href: "/simulacao-compra", label: "Simular compra", icon: ShoppingBag },
    ],
  },
  {
    title: "Configuração",
    items: [
      { href: "/importar", label: "Importar", icon: FileUp },
      { href: "/regras", label: "Regras", icon: Wand2 },
      { href: "/categorias", label: "Categorias", icon: Tags },
      { href: "/ia", label: "Gerenciador IA", icon: Bot },
      { href: "/cofre", label: "Cofre", icon: Lock },
    ],
  },
];

const ADMIN_NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Administração",
    items: [
      { href: "/admin", label: "Usuários", icon: Shield },
      { href: "/cofre", label: "Cofre admin", icon: Lock },
    ],
  },
];

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { activeProfile, lock, switchUser, isAdminSession } = useVault();

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : href === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(href);
  }

  const groups = isAdminSession ? ADMIN_NAV_GROUPS : NAV_GROUPS;

  const links = (
    <nav className="flex flex-col gap-5" aria-label="Principal">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="type-label mb-1.5 px-3">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 px-3 py-[9px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      active
                        ? "rounded-r-lg rounded-l-none border-l-[3px] border-foreground bg-foreground/[0.06] font-semibold text-foreground"
                        : "rounded-lg text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const avatarLetters = activeProfile
    ? activeProfile.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || "?"
    : "";

  const userCard = activeProfile ? (
    <div className="surface-item p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#ccebe0] text-[13px] font-bold text-foreground">
          {isAdminSession ? (
            <Shield className="size-4" />
          ) : (
            avatarLetters
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight">
            {activeProfile.name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {activeProfile.displayName
              ? `@${activeProfile.displayName}`
              : isAdminSession
                ? "Admin · sem acesso a dados"
                : "Cofre protegido"}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3 w-full justify-center gap-2 font-medium"
        onClick={() => {
          setOpen(false);
          switchUser();
        }}
      >
        <Users className="size-4" />
        Trocar usuário
      </Button>
    </div>
  ) : null;

  const lockAction = activeProfile ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground"
      onClick={() => {
        setOpen(false);
        lock();
      }}
    >
      <Lock className="size-4" />
      Bloquear cofre
    </Button>
  ) : null;

  return (
    <>
      <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 backdrop-blur-xl md:flex">
        <div className="mb-6 px-2">
          <p className="brand-mark">Gestão Financeira</p>
        </div>
        {userCard ? <div className="mb-6 shrink-0">{userCard}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {links}
        </div>
        {lockAction ? (
          <div className="mt-3 shrink-0 border-t border-border/50 pt-3">
            {lockAction}
          </div>
        ) : null}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="min-w-0">
          <p className="brand-mark text-lg">Gestão Financeira</p>
          {activeProfile ? (
            <p className="truncate text-xs text-muted-foreground">
              {activeProfile.name}
              {activeProfile.displayName
                ? ` · @${activeProfile.displayName}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {activeProfile ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => switchUser()}
              aria-label="Trocar usuário"
            >
              <Users className="size-3.5" />
              Trocar
            </Button>
          ) : null}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Abrir menu" />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col">
              <SheetHeader>
                <SheetTitle className="font-heading text-left">
                  Gestão Financeira
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-1 flex-col overflow-y-auto px-1">
                {userCard ? <div className="mb-4">{userCard}</div> : null}
                {links}
                {lockAction ? (
                  <div className="mt-auto border-t border-border/50 pt-3">
                    {lockAction}
                  </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
