"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVault } from "@/lib/vault-context";

/** Admin só acessa /admin e /cofre — nunca telas com dados financeiros. */
const ADMIN_ALLOWED = new Set(["/admin", "/cofre"]);

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { isAdminSession } = useVault();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAdminSession) return;
    const allowed = ADMIN_ALLOWED.has(pathname);
    if (!allowed) {
      router.replace("/admin");
    }
  }, [isAdminSession, pathname, router]);

  if (isAdminSession && !ADMIN_ALLOWED.has(pathname)) {
    return (
      <p className="text-sm text-muted-foreground">
        Redirecionando para a área administrativa…
      </p>
    );
  }

  return <>{children}</>;
}
