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
  Users,
  UserRound,
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

const NAV = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/fluxo", label: "Fluxo", icon: ArrowLeftRight },
  { href: "/patrimonio", label: "Patrimônio", icon: PieChart },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { href: "/inteligencia", label: "Inteligência", icon: Brain },
  { href: "/contas", label: "Contas", icon: Landmark },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/transferencias", label: "Transferir", icon: ArrowRightLeft },
  { href: "/rendas", label: "Rendas", icon: Wallet },
  { href: "/aplicacoes", label: "Aplicações", icon: TrendingUp },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/assinaturas", label: "Assinaturas", icon: Repeat },
  { href: "/orcamentos", label: "Orçamentos", icon: PiggyBank },
  { href: "/dividas", label: "Dívidas", icon: ScrollText },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/regras", label: "Regras", icon: Wand2 },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/importar", label: "Importar", icon: FileUp },
  { href: "/cofre", label: "Cofre", icon: Lock },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { activeProfile, lock, switchUser } = useVault();

  const links = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const sessionBlock = activeProfile ? (
    <div className="mt-auto space-y-2 border-t border-border/60 pt-4">
      <div className="flex items-center gap-2 px-2">
        <UserRound className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{activeProfile.name}</p>
          <p className="text-[11px] text-muted-foreground">
            ● Cofre desbloqueado
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2"
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
        className="w-full justify-start gap-2"
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
      <aside className="hidden w-56 shrink-0 border-r border-border/60 bg-sidebar/40 p-4 md:flex md:flex-col">
        <div className="mb-6 px-2">
          <p className="font-heading text-lg font-semibold tracking-tight text-primary">
            Gestão Financeira
          </p>
          {activeProfile ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {activeProfile.name}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Visão 360° local</p>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {links}
        </div>
        {sessionBlock}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md md:hidden">
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
              <Button variant="ghost" size="icon" aria-label="Menu" />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col">
            <SheetHeader>
              <SheetTitle className="font-heading text-left">Menu</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-1 flex-col overflow-y-auto px-2">
              {links}
              {sessionBlock}
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
