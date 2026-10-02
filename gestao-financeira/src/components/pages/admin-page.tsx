"use client";

import { useEffect, useState } from "react";
import { Pencil, Shield, Trash2 } from "lucide-react";
import { useVault } from "@/lib/vault-context";
import { PageHeader } from "@/components/ui-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function kindLabel(kind: string): string {
  if (kind === "demo") return "Demonstração";
  if (kind === "admin") return "Administrador";
  return "Pessoal";
}

export function AdminPage() {
  const {
    activeProfile,
    listProfilesForAdmin,
    adminWipeProfile,
    adminUpdateUserProfile,
    refreshProfiles,
    error,
    clearError,
  } = useVault();

  const [rows, setRows] = useState(listProfilesForAdmin());
  const [wipeTargetId, setWipeTargetId] = useState<string | null>(null);
  const [wipeTargetName, setWipeTargetName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [confirm, setConfirm] = useState(false);

  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLogin, setEditLogin] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows(listProfilesForAdmin());
  }, [listProfilesForAdmin]);

  if (!activeProfile || activeProfile.kind !== "admin") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Esta área é exclusiva do administrador.
        </AlertDescription>
      </Alert>
    );
  }

  async function wipe() {
    if (!wipeTargetId || !confirm) {
      setMsg("Confirme a exclusão marcando a caixa.");
      return;
    }
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      await adminWipeProfile(wipeTargetId, adminPin);
      await refreshProfiles();
      setRows(listProfilesForAdmin());
      setWipeTargetId(null);
      setAdminPin("");
      setConfirm(false);
      setMsg(
        `Dados de "${wipeTargetName}" foram apagados. O conteúdo financeiro nunca foi aberto nesta sessão.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editTargetId) return;
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      await adminUpdateUserProfile(editTargetId, {
        name: editName,
        login: editLogin,
      });
      await refreshProfiles();
      setRows(listProfilesForAdmin());
      setEditTargetId(null);
      setMsg("Nome e login atualizados.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Administração"
        description="Você pode editar nome/login e excluir cofres de outros usuários. Não é possível abrir ou visualizar o conteúdo financeiro deles."
      />

      <Alert className="mb-4 border-primary/30 bg-primary/5">
        <Shield className="size-4" />
        <AlertDescription>
          Isolamento: edição altera só metadados públicos. Exclusão remove o
          arquivo cifrado sem carregar o plaintext nem pedir o PIN do usuário.
        </AlertDescription>
      </Alert>

      {(msg || error) && (
        <Alert
          variant={
            error || /Falha|Somente|necessário|já está|deve|Informe/i.test(msg ?? "")
              ? "destructive"
              : "default"
          }
          className="mb-4"
        >
          <AlertDescription>{error ?? msg}</AlertDescription>
        </Alert>
      )}

      <section className="rounded-xl border border-border/60 bg-card/40 p-5">
        <h2 className="font-heading text-lg font-medium">Usuários no dispositivo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Metadados públicos (nome e login). Sem saldos, lançamentos ou
          documentos.
        </p>
        <ul className="mt-4 divide-y divide-border/50">
          {rows.length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">
              Nenhum outro usuário para administrar.
            </li>
          ) : (
            rows.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {kindLabel(p.kind)}
                    {p.displayName ? ` · ${p.displayName}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setEditTargetId(p.id);
                      setEditName(p.name);
                      setEditLogin(p.displayName ?? "");
                      setMsg(null);
                      clearError();
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setWipeTargetId(p.id);
                      setWipeTargetName(p.name);
                      setAdminPin("");
                      setConfirm(false);
                      setMsg(null);
                      clearError();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Excluir dados
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <Dialog
        open={!!editTargetId}
        onOpenChange={(o) => {
          if (!o) setEditTargetId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Altere o nome de apresentação e o login. O cofre financeiro não é
            aberto nesta operação.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-edit-name">Nome de apresentação</Label>
              <Input
                id="admin-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ex.: João Silva"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-edit-login">Login</Label>
              <Input
                id="admin-edit-login"
                value={editLogin}
                onChange={(e) =>
                  setEditLogin(
                    e.target.value.toLowerCase().replace(/\s/g, ""),
                  )
                }
                placeholder="ex.: joao.silva"
                spellCheck={false}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Sem espaços. Letras, números, ponto, _ ou -.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditTargetId(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !editName.trim() || !editLogin.trim()}
              onClick={() => void saveEdit()}
            >
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!wipeTargetId}
        onOpenChange={(o) => {
          if (!o) setWipeTargetId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir dados de &quot;{wipeTargetName}&quot;?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta ação apaga o perfil e o cofre cifrado deste usuário neste
            dispositivo. Você não verá o conteúdo financeiro — apenas remove o
            acesso local. Informe o <strong>seu</strong> PIN de administrador
            para confirmar.
          </p>
          <div className="space-y-2">
            <Label htmlFor="admin-wipe-pin">PIN do administrador</Label>
            <Input
              id="admin-wipe-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirm}
              onCheckedChange={(v) => setConfirm(v === true)}
            />
            <span>
              Entendo que os dados de {wipeTargetName} serão removidos
              permanentemente deste dispositivo.
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setWipeTargetId(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !confirm || adminPin.length < 4}
              onClick={() => void wipe()}
            >
              {busy ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
