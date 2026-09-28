"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Upload, Lock, Trash2, KeyRound, UserRound } from "lucide-react";
import { useVault } from "@/lib/vault-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui-helpers";
import { AIModelSetup } from "@/ai/ui/AIModelSetup";
import type { ImportVaultMode } from "@/lib/vault-context";
import type { ProfileAvatar } from "@/adapters";

export function CofrePage() {
  const {
    snapshot,
    activeProfile,
    lock,
    switchUser,
    downloadVault,
    importVault,
    updateProfileMeta,
    changePin,
    deleteProfile,
    error,
    clearError,
  } = useVault();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importPin, setImportPin] = useState("");
  const [importMode, setImportMode] = useState<ImportVaultMode>("new_user");
  const [importName, setImportName] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const [pinOpen, setPinOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [profileName, setProfileName] = useState(activeProfile?.name ?? "");
  const [avatar, setAvatar] = useState<ProfileAvatar>(
    activeProfile?.avatar ?? "user",
  );

  useEffect(() => {
    if (activeProfile) {
      setProfileName(activeProfile.name);
      setAvatar(activeProfile.avatar ?? "user");
    }
  }, [activeProfile]);

  if (!snapshot || !activeProfile) return null;

  async function onDownload() {
    clearError();
    setMsg(null);
    setBusy(true);
    try {
      await downloadVault();
      setMsg("Cofre baixado. Guarde o arquivo .gfin em local seguro.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no download");
    } finally {
      setBusy(false);
    }
  }

  function onFilePicked(file: File | undefined) {
    if (!file) return;
    setPendingFile(file);
    setImportPin("");
    setImportMode("new_user");
    setImportName(file.name.replace(/\.gfin$/i, ""));
    setConfirmReplace(false);
    clearError();
    setImportOpen(true);
  }

  async function confirmImport() {
    if (!pendingFile) return;
    if (importMode === "replace_active" && !confirmReplace) {
      setMsg("Marque a confirmação para substituir o usuário atual.");
      return;
    }
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      await importVault(pendingFile, importPin, {
        mode: importMode,
        name: importName,
      });
      setImportOpen(false);
      setMsg(
        importMode === "new_user"
          ? "Novo usuário criado a partir do arquivo."
          : "Cofre do usuário atual substituído.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      await updateProfileMeta({ name: profileName, avatar });
      setMsg("Perfil atualizado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar perfil");
    } finally {
      setBusy(false);
    }
  }

  async function confirmChangePin() {
    if (newPin !== confirmPin) {
      setMsg("Os novos PINs não coincidem");
      return;
    }
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      await changePin(currentPin, newPin);
      setPinOpen(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setMsg("PIN alterado. O cofre foi recriptografado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao alterar PIN");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!activeProfile) return;
    if (!deleteConfirm) {
      setMsg("Confirme a exclusão marcando a caixa.");
      return;
    }
    const profileId = activeProfile.id;
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      await deleteProfile(profileId, deletePin);
      setDeleteOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cofre"
        description="Perfil local, PIN e arquivo .gfin. Cada usuário tem um cofre independente."
      />

      <div className="space-y-4">
        <section className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-heading text-lg font-medium">Perfil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeProfile.kind === "demo"
              ? "Usuário de apresentação (dados fictícios)"
              : "Usuário pessoal"}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Avatar</Label>
              <Select
                value={avatar}
                onValueChange={(v) =>
                  v && setAvatar(v as ProfileAvatar)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Padrão</SelectItem>
                  <SelectItem value="demo">Apresentação</SelectItem>
                  <SelectItem value="briefcase">Trabalho</SelectItem>
                  <SelectItem value="star">Destaque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void saveProfile()} disabled={busy}>
              <UserRound className="size-4" />
              Salvar perfil
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMsg(null);
                setPinOpen(true);
              }}
            >
              <KeyRound className="size-4" />
              Alterar PIN
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-heading text-lg font-medium">Status do cofre</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Usuário: <strong>{activeProfile.name}</strong>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Última atualização:{" "}
            {new Date(snapshot.updatedAt).toLocaleString("pt-BR")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Envelope <code className="text-xs">.gfin</code> v1 · schema{" "}
            {snapshot.schemaVersion}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void onDownload()} disabled={busy}>
              <Download className="size-4" />
              Exportar cofre
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload className="size-4" />
              Importar .gfin
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".gfin,application/json"
              className="hidden"
              onChange={(e) => onFilePicked(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={lock}>
              <Lock className="size-4" />
              Bloquear
            </Button>
            <Button variant="ghost" onClick={switchUser}>
              Trocar usuário
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-heading text-lg font-medium">
            Migração entre dispositivos
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Exporte o <strong>.gfin</strong> deste usuário.
            </li>
            <li>No outro aparelho, importe escolhendo “Criar novo usuário”.</li>
            <li>Use o mesmo PIN do arquivo.</li>
          </ol>
          <p className="mt-3 text-sm">
            <Link
              href="/"
              className="text-primary underline-offset-2 hover:underline"
            >
              Voltar ao painel
            </Link>
          </p>
        </section>

        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <h2 className="font-heading text-lg font-medium text-destructive">
            Excluir usuário
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove &quot;{activeProfile.name}&quot; e o cofre deste dispositivo.
            Outros usuários não são afetados.
          </p>
          <Button
            variant="destructive"
            className="mt-3"
            onClick={() => {
              setDeletePin("");
              setDeleteConfirm(false);
              setMsg(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4" />
            Excluir usuário
          </Button>
        </section>

        {(msg || error) && (
          <Alert variant={error ? "destructive" : "default"}>
            <AlertTitle>{error ? "Erro" : "Aviso"}</AlertTitle>
            <AlertDescription>{error ?? msg}</AlertDescription>
          </Alert>
        )}
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar cofre</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Arquivo: <strong>{pendingFile?.name}</strong>
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Como deseja importar?</Label>
              <Select
                value={importMode}
                onValueChange={(v) =>
                  v && setImportMode(v as ImportVaultMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_user">Criar novo usuário</SelectItem>
                  <SelectItem value="replace_active">
                    Substituir &quot;{activeProfile.name}&quot;
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {importMode === "new_user" && (
              <div className="space-y-1.5">
                <Label>Nome do novo usuário</Label>
                <Input
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>PIN do arquivo</Label>
              <Input
                type="password"
                value={importPin}
                onChange={(e) => setImportPin(e.target.value)}
                className="tracking-widest"
              />
            </div>
            {importMode === "replace_active" && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  onChange={(e) => setConfirmReplace(e.target.checked)}
                  className="mt-1"
                />
                Confirmo substituir o cofre de &quot;{activeProfile.name}&quot;
                pelos dados deste arquivo.
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmImport()}
              disabled={busy || !importPin}
            >
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar PIN</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O cofre será recriptografado com um novo salt. Os dados financeiros
            permanecem os mesmos.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>PIN atual</Label>
              <Input
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                className="tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Novo PIN</Label>
              <Input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="tracking-widest"
                minLength={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar novo PIN</Label>
              <Input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="tracking-widest"
                minLength={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmChangePin()}
              disabled={busy || !currentPin || newPin.length < 4}
            >
              Alterar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir &quot;{activeProfile.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todos os dados desse cofre serão removidos deste dispositivo. Esta
            ação não pode ser desfeita.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>PIN do usuário</Label>
              <Input
                type="password"
                value={deletePin}
                onChange={(e) => setDeletePin(e.target.value)}
                className="tracking-widest"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.checked)}
                className="mt-1"
              />
              Entendo que os dados de &quot;{activeProfile.name}&quot; serão
              apagados permanentemente neste navegador.
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={busy || !deletePin || !deleteConfirm}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mt-10 border-t border-border/40 pt-8">
        <h2 className="mb-1 flex items-center gap-2 text-base font-medium">
          <span className="text-primary" aria-hidden>
            ✦
          </span>
          IA local
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          O modelo roda neste dispositivo. Nada do cofre é enviado a APIs
          externas.
        </p>
        <AIModelSetup />
      </section>
    </div>
  );
}
