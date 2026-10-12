"use client";

import { useEffect, useState } from "react";
import { UserRound, Presentation, Plus, ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useVault, type CreateProfileMode } from "@/lib/vault-context";
import {
  ADMIN_PROFILE_ID,
  MARINA_DEMO_PIN,
  MARINA_DEMO_USERNAME,
  type UserProfile,
} from "@/adapters";
import { ADMIN_DISPLAY_NAME } from "@/domain/admin-profile";
import { PIN_MIN_LENGTH, PIN_MIN_LENGTH_LEGACY } from "@/security/limits";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    status,
    error,
    clearError,
    profiles,
    selectedProfile,
    selectProfile,
    clearSelectedProfile,
    unlock,
    createDemoOnboarding,
    createEmptyOnboarding,
    createProfile,
    migrateLegacy,
    abandonLegacyVault,
    ensureMarinaAlongside,
    createAdminOnboarding,
  } = useVault();

  const [view, setView] = useState<
    "home" | "create" | "empty_setup" | "create_admin"
  >("home");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [createMode, setCreateMode] = useState<CreateProfileMode>("empty");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "user_selection" || status === "pin_required") {
      setView("home");
      setPin("");
      setConfirm("");
      setLocalError(null);
    }
  }, [status]);

  if (status === "loading") {
    return (
      <GateShell>
        <p className="animate-pulse text-muted-foreground">Carregando…</p>
      </GateShell>
    );
  }

  if (status === "error") {
    return (
      <GateShell>
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error ?? "Falha inesperada"}</AlertDescription>
        </Alert>
      </GateShell>
    );
  }

  if (status === "unlocked") {
    return <>{children}</>;
  }

  const displayError = localError || error;

  async function run(action: () => Promise<void>) {
    clearError();
    setLocalError(null);
    setBusy(true);
    try {
      await action();
      setPin("");
      setConfirm("");
      setName("");
      setLogin("");
      setView("home");
    } catch (e) {
      if (!error) {
        setLocalError(e instanceof Error ? e.message : "Falha");
      }
    } finally {
      setBusy(false);
    }
  }

  // --- Migração do cofre único ---
  if (status === "migrate_legacy") {
    return (
      <GateShell>
        <div className="gate-hero">
          <p className="brand-mark">Gestão Financeira</p>
          <h1 className="gate-title">Encontramos seu cofre</h1>
          <p className="gate-lead">
            Há um cofre antigo neste navegador (antes do sistema de usuários).
            Digite o <strong>PIN que você já usava</strong> para convertê-lo.
            O PIN da demonstração Marina é outro e só vale se for o mesmo que
            você usava.
          </p>
        </div>
        <form
          className="gate-form space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              migrateLegacy({
                name: name.trim() || "Meu usuário",
                login: login.trim() || "meu.usuario",
                pin,
              }),
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="mig-name">Nome de apresentação</Label>
            <Input
              id="mig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: João Silva"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mig-login">Login</Label>
            <Input
              id="mig-login"
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              placeholder="ex.: joao.silva"
              autoComplete="username"
              spellCheck={false}
              required
            />
            <p className="text-xs text-muted-foreground">
              Sem espaços. Use letras, números, ponto, _ ou -.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mig-pin">PIN atual do cofre</Label>
            <Input
              id="mig-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="text-lg tracking-widest"
              required
              minLength={PIN_MIN_LENGTH_LEGACY}
            />
          </div>
          {displayError && (
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Migrando…" : "Continuar"}
          </Button>
        </form>

        <div className="space-y-2 border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground">
            Depois de migrar com o PIN antigo, a Marina (demo) é criada ao
            lado automaticamente — você troca pelo menu sem misturar dados.
          </p>
          <p className="text-xs text-muted-foreground">
            Não lembra o PIN antigo? Sem ele o cofre antigo não abre. Você pode
            descartá-lo e criar só a Marina (dados pessoais antigos serão
            apagados deste navegador).
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await abandonLegacyVault();
                await createDemoOnboarding(MARINA_DEMO_PIN);
              })
            }
          >
            <Presentation className="size-4" />
            Só Marina (descarta cofre antigo)
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await abandonLegacyVault();
              })
            }
          >
            Descartar cofre antigo e começar do zero
          </Button>
        </div>
      </GateShell>
    );
  }

  // --- Primeira execução ---
  if (status === "no_users" && view === "home") {
    return (
      <GateShell>
        <div className="gate-hero">
          <p className="brand-mark">Gestão Financeira</p>
          <h1 className="gate-title">Bem-vindo</h1>
          <p className="gate-lead">
            Crie o perfil de demonstração da Marina Costa (história financeira
            completa) ou comece do zero com o seu cofre pessoal.
          </p>
        </div>
        <div className="space-y-3">
          <Button
            className="w-full justify-start gap-3"
            size="lg"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await createDemoOnboarding(MARINA_DEMO_PIN);
              })
            }
          >
            <Presentation className="size-5" />
            Criar apresentação · Marina Costa
          </Button>
          <p className="px-1 text-xs text-muted-foreground">
            Usuário <strong>{MARINA_DEMO_USERNAME}</strong> · perfil de
            demonstração fictício (~12 meses de dados). O PIN de demo não é
            credencial de produção.
            {/* PIN de demo nunca é exibido na UI final/produção. */}
          </p>
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            size="lg"
            onClick={() => {
              setView("empty_setup");
              setName("Meu usuário");
              setLogin("meu.usuario");
            }}
          >
            <UserRound className="size-5" />
            Começar do zero
          </Button>
        </div>
        {displayError && (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}
      </GateShell>
    );
  }

  // --- Setup vazio (onboarding) ---
  if (status === "no_users" && view === "empty_setup") {
    return (
      <GateShell>
        <Back onClick={() => setView("home")} />
        <div className="gate-hero">
          <p className="brand-mark">Gestão Financeira</p>
          <h1 className="gate-title">Criar usuário</h1>
          <p className="gate-lead">
            Defina nome de apresentação, login e PIN. O PIN cifra o cofre — não
            é armazenado em texto puro.
          </p>
        </div>
        <form
          className="gate-form space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin !== confirm) {
              setLocalError("Os PINs não coincidem");
              return;
            }
            void run(() =>
              createEmptyOnboarding(
                name.trim() || "Meu usuário",
                login.trim(),
                pin,
              ),
            );
          }}
        >
          <NamePinFields
            name={name}
            setName={setName}
            login={login}
            setLogin={setLogin}
            pin={pin}
            setPin={setPin}
            confirm={confirm}
            setConfirm={setConfirm}
          />
          {displayError && (
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Criando…" : "Criar cofre"}
          </Button>
        </form>
      </GateShell>
    );
  }

  // --- PIN do usuário selecionado ---
  if (status === "pin_required" && selectedProfile) {
    return (
      <GateShell>
        <Back
          onClick={() => {
            clearSelectedProfile();
            setPin("");
            setLocalError(null);
            clearError();
          }}
        />
        <div className="gate-hero">
          <p className="brand-mark">Gestão Financeira</p>
          <h1 className="gate-title">Digite o PIN</h1>
          <p className="gate-lead">
            Desbloqueando <strong>{selectedProfile.name}</strong>
            {selectedProfile.displayName
              ? ` (@${selectedProfile.displayName})`
              : ""}
            {selectedProfile.kind === "demo"
              ? " — dados de demonstração"
              : selectedProfile.kind === "admin"
                ? " — administração (sem ver dados de outros)"
                : " — dados pessoais"}
          </p>
        </div>
        <form
          className="gate-form space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => unlock(pin));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="unlock-pin">PIN</Label>
            <Input
              id="unlock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="• • • •"
              className="text-center text-lg tracking-[0.4em]"
              required
              minLength={PIN_MIN_LENGTH_LEGACY}
              autoFocus
            />
          </div>
          {displayError && (
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Desbloqueando…" : "Desbloquear"}
          </Button>
        </form>
      </GateShell>
    );
  }

  // --- Criar administrador ---
  if (view === "create_admin") {
    return (
      <GateShell>
        <Back
          onClick={() => {
            setView("home");
            setLocalError(null);
          }}
        />
        <div className="gate-hero">
          <p className="brand-mark">Gestão Financeira</p>
          <h1 className="gate-title">{ADMIN_DISPLAY_NAME}</h1>
          <p className="gate-lead">
            Terceiro usuário com poder de excluir cofres neste dispositivo. Login
            fixo <strong>admin.local</strong>. Não consegue abrir nem visualizar
            os dados financeiros dos demais.
          </p>
        </div>
        <form
          className="gate-form space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin !== confirm) {
              setLocalError("Os PINs não coincidem");
              return;
            }
            void run(async () => {
              await createAdminOnboarding(pin);
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="admin-pin">PIN do administrador</Label>
            <Input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              minLength={PIN_MIN_LENGTH}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-pin-confirm">Confirmar PIN</Label>
            <Input
              id="admin-pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={PIN_MIN_LENGTH}
            />
          </div>
          {displayError && (
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Criando…" : "Criar administrador"}
          </Button>
        </form>
      </GateShell>
    );
  }

  // --- Criar usuário (da seleção ou onboarding demo) ---
  if (view === "create") {
    return (
      <GateShell>
        <Back
          onClick={() => {
            setView("home");
            setLocalError(null);
          }}
        />
        <div className="gate-hero">
          <p className="brand-mark">Gestão Financeira</p>
          <h1 className="gate-title">
            {createMode === "demo" ? "Usuário de apresentação" : "Novo usuário"}
          </h1>
          <p className="gate-lead">
            {createMode === "demo"
              ? "Dados fictícios para demonstrar o app. Independente do seu cofre pessoal."
              : "Cada usuário tem um cofre cifrado próprio."}
          </p>
        </div>
        <form
          className="gate-form space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin !== confirm) {
              setLocalError("Os PINs não coincidem");
              return;
            }
            void run(async () => {
              if (status === "no_users" && createMode === "demo") {
                await createDemoOnboarding(pin);
              } else {
                await createProfile({
                  name:
                    name.trim() ||
                    (createMode === "demo" ? "Apresentação" : "Usuário"),
                  login:
                    login.trim() ||
                    (createMode === "demo" ? "apresentacao" : ""),
                  pin,
                  mode: createMode,
                  kind: createMode === "demo" ? "demo" : "personal",
                });
              }
            });
          }}
        >
          <NamePinFields
            name={name}
            setName={setName}
            login={login}
            setLogin={setLogin}
            pin={pin}
            setPin={setPin}
            confirm={confirm}
            setConfirm={setConfirm}
            requireLogin={createMode !== "demo"}
          />
          {status !== "no_users" && (
            <div className="space-y-2">
              <Label>Como deseja começar?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={createMode === "empty" ? "default" : "outline"}
                  onClick={() => setCreateMode("empty")}
                >
                  Dados vazios
                </Button>
                <Button
                  type="button"
                  variant={createMode === "demo" ? "default" : "outline"}
                  onClick={() => setCreateMode("demo")}
                >
                  Demonstração
                </Button>
              </div>
            </div>
          )}
          {displayError && (
            <Alert variant="destructive">
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Criando…" : "Criar usuário"}
          </Button>
        </form>
      </GateShell>
    );
  }

  // --- Seleção de usuários ---
  return (
    <GateShell>
      <div className="gate-hero">
        <p className="brand-mark">Gestão Financeira</p>
        <h1 className="gate-title">Quem está acessando?</h1>
        <p className="gate-lead">
          Selecione um usuário. Os dados financeiros só aparecem após o PIN.
        </p>
      </div>
      <ul className="space-y-3">
        {profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => {
                clearError();
                setLocalError(null);
                void selectProfile(p.id);
              }}
              className="surface-panel flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:border-primary/30 hover:bg-white/70"
            >
              <ProfileAvatarIcon profile={p} />
              <span>
                <span className="block font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {p.displayName ? `@${p.displayName} · ` : ""}
                  {p.kind === "admin"
                    ? "Administrador · pode excluir, não vê dados"
                    : p.kind === "demo" || p.id === "prof_marina_demo"
                      ? "demonstração"
                      : "dados pessoais"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        className="mt-4 w-full gap-2"
        onClick={() => {
          setView("create");
          setCreateMode("empty");
          setName("");
          setLogin("");
          setPin("");
          setConfirm("");
        }}
      >
        <Plus className="size-4" />
        Adicionar usuário
      </Button>
      {!profiles.some((p) => p.id === ADMIN_PROFILE_ID || p.kind === "admin") && (
        <Button
          variant="outline"
          className="mt-2 w-full gap-2"
          onClick={() => {
            setView("create_admin");
            setPin("");
            setConfirm("");
            setLocalError(null);
          }}
        >
          <Shield className="size-4" />
          Criar administrador
        </Button>
      )}
      {!profiles.some((p) => p.id === "prof_marina_demo") && (
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await ensureMarinaAlongside(MARINA_DEMO_PIN);
            })
          }
        >
          <Presentation className="size-4" />
          Adicionar Marina Costa (demo fixa)
        </Button>
      )}
      {displayError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}
    </GateShell>
  );
}

function NamePinFields({
  name,
  setName,
  login,
  setLogin,
  pin,
  setPin,
  confirm,
  setConfirm,
  requireLogin = true,
}: {
  name: string;
  setName: (v: string) => void;
  login: string;
  setLogin: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  requireLogin?: boolean;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="user-name">Nome de apresentação</Label>
        <Input
          id="user-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: João Silva"
          required
        />
        <p className="text-xs text-muted-foreground">
          Como o nome aparece na lista. Pode ter espaços.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-login">Login</Label>
        <Input
          id="user-login"
          value={login}
          onChange={(e) =>
            setLogin(e.target.value.toLowerCase().replace(/\s/g, ""))
          }
          placeholder="ex.: joao.silva"
          autoComplete="username"
          spellCheck={false}
          required={requireLogin}
          pattern="[a-z][a-z0-9._\-]*"
          title="Sem espaços. Comece com letra; use a-z, 0-9, ., _ ou -"
        />
        <p className="text-xs text-muted-foreground">
          Identificador único. Sem espaços entre palavras. Apenas letras
          minúsculas, números, ponto, _ ou -.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-pin">PIN</Label>
        <Input
          id="user-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={`Mínimo ${PIN_MIN_LENGTH} caracteres`}
          className="text-lg tracking-widest"
          required
          minLength={PIN_MIN_LENGTH}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-confirm">Confirmar PIN</Label>
        <Input
          id="user-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="text-lg tracking-widest"
          required
          minLength={PIN_MIN_LENGTH}
        />
      </div>
    </>
  );
}

function ProfileAvatarIcon({ profile }: { profile: UserProfile }) {
  const Icon =
    profile.kind === "admin"
      ? Shield
      : profile.kind === "demo"
        ? Presentation
        : UserRound;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="size-5" />
    </span>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Voltar
    </button>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="gate-panel w-full max-w-md space-y-8">{children}</div>
    </div>
  );
}
