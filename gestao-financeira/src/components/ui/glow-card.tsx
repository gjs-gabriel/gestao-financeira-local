import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card glass com glow radial (insight) — heroes de patrimônio / saldo. */
export function GlowCard({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={cn("group/glow", className)}>
      <div
        className={cn(
          "glow-insight glass-surface relative rounded-2xl p-5 md:p-6",
          hover && "card-premium-hover",
        )}
      >
        {children}
      </div>
    </div>
  );
}
