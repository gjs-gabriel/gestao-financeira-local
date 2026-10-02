"use client";

import { useEffect } from "react";
import { VaultProvider, useVault } from "@/lib/vault-context";
import { AuthGate } from "@/components/auth-gate";
import { AppNav } from "@/components/app-nav";
import { AIProviderGate } from "@/ai/ui/AIProvider";
import { AdminRouteGuard } from "@/components/admin-route-guard";
import {
  formatMarinaCredentialsBanner,
  resetMarinaDemoProfile,
  ensureMarinaDemoProfile,
  MARINA_DEMO_CREDENTIALS,
} from "@/adapters";

function MarinaSeedBridge() {
  const { refreshProfiles, seedMarinaDemo } = useVault();

  useEffect(() => {
    const api = {
      credentials: MARINA_DEMO_CREDENTIALS,
      banner: formatMarinaCredentialsBanner(),
      ensure: async () => {
        const r = await ensureMarinaDemoProfile();
        await refreshProfiles();
        console.log(r.banner);
        return r;
      },
      reset: async () => {
        const r = await resetMarinaDemoProfile();
        await refreshProfiles();
        await seedMarinaDemo({ reset: false });
        console.log(r.banner);
        return r;
      },
    };
    (
      window as unknown as { __marinaDemo?: typeof api }
    ).__marinaDemo = api;
    return () => {
      delete (window as unknown as { __marinaDemo?: typeof api }).__marinaDemo;
    };
  }, [refreshProfiles, seedMarinaDemo]);

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <VaultProvider>
      <MarinaSeedBridge />
      <AuthGate>
        <AIProviderGate>
          <AdminRouteGuard>
            <div className="app-shell flex min-h-dvh flex-col md:flex-row">
              <AppNav />
              <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-10 lg:px-10">
                <div className="mx-auto w-full max-w-[1280px] animate-fade-in">
                  {children}
                </div>
              </main>
            </div>
          </AdminRouteGuard>
        </AIProviderGate>
      </AuthGate>
    </VaultProvider>
  );
}
