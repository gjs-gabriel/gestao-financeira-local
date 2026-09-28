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
  UserRound,
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
    title: "Visão geral",
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard },
      { href: "/analista", label: "Analista", icon: Sparkles },
      { href: "/fluxo", label: "Fluxo", icon: ArrowLeftRight },
      { href: "/patrimonio", label: "Patrimônio", icon: PieChart },
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
      { href: "/inteligencia", label: "Inteligência", icon: Brain },
    ],
  },
  {
    title: "Dinheiro",
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
    title: "Organização",
    items: [
      { href: "/regras", label: "Regras", icon: Wand2 },
      { href: "/alertas", label: "Alertas", icon: Bell },
      { href: "/categorias", label: "Categorias", icon: Tags },
      { href: "/importar", label: "Clips", icon: FileUp },
      { href: "/cofre", label: "Cofre", icon: Lock },
    ],
  },
];

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { activeProfile, lock, switchUser } = useVault();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  const links = (
    <nav className="flex flex-col gap-5" aria-label="Principal">
      {NAV_GROUPS.map((group) => (
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
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/75 hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
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

  const sessionBlock = activeProfile ? (
    <div className="mt-auto space-y-1 border-t border-border/50 pt-4">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{activeProfile.name}</p>
          <p className="text-[11px] text-muted-foreground">Cofre protegido</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={() => {
          setOpen(false);
          switchUser();
        }}
      >
        <Users className="size-4" />
        Trocar usuário
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={() => {
          setOpen(false);
          lock();
        }}
      >
        <Lock className="size-4" />
        Bloquear
      </Button>
    </div>
  ) : null;

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-border/40 bg-sidebar/50 p-4 md:flex md:flex-col">
        <div className="mb-7 px-2">
          <p className="font-heading text-[1.05rem] font-semibold tracking-tight text-primary">
            Gestão
          </p>
          <p className="font-heading text-[1.05rem] font-semibold tracking-tight text-primary/80">
            Financeira
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {links}
        </div>
        {sessionBlock}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold text-primary">
            Gestão Financeira
          </p>
          {activeProfile ? (
            <p className="truncate text-xs text-muted-foreground">
              {activeProfile.name}
            </p>
          ) : null}
        </div>
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
              {links}
              {sessionBlock}
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
