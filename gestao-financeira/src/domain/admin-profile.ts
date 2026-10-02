/**
 * Perfil administrador local — metadados públicos.
 * NÃO contém PIN, chave ou dados financeiros de outros usuários.
 */

export const ADMIN_PROFILE_ID = "prof_admin_local";
export const ADMIN_VAULT_ID = "vault_admin_local";
export const ADMIN_DISPLAY_NAME = "Administrador";
export const ADMIN_USERNAME = "admin.local";

type AdminTargetInput = {
  actorKind: string;
  actorId: string;
  targetId: string;
  targetKind: string;
};

function assertAdminTargetsOtherUser(
  input: AdminTargetInput,
  action: "excluir" | "editar",
): void {
  if (input.actorKind !== "admin") {
    throw new Error(
      action === "excluir"
        ? "Somente o administrador pode excluir dados de outros usuários."
        : "Somente o administrador pode editar nome e login de outros usuários.",
    );
  }
  if (input.actorId === input.targetId) {
    throw new Error(
      action === "excluir"
        ? "Para excluir a própria conta admin, use a exclusão do Cofre."
        : "Para editar a própria conta admin, use o Cofre.",
    );
  }
  if (input.targetKind === "admin") {
    throw new Error(
      action === "excluir"
        ? "Não é permitido excluir outro administrador por este fluxo."
        : "Não é permitido editar outro administrador por este fluxo.",
    );
  }
}

/**
 * Política pura: admin pode apagar o cofre de outro usuário
 * sem nunca precisar do PIN nem do plaintext da vítima.
 */
export function assertAdminCanWipeTarget(input: AdminTargetInput): void {
  assertAdminTargetsOtherUser(input, "excluir");
}

/**
 * Admin pode alterar nome de apresentação e login (metadados públicos)
 * de usuários pessoais/demo — sem abrir o cofre deles.
 */
export function assertAdminCanEditTarget(input: AdminTargetInput): void {
  assertAdminTargetsOtherUser(input, "editar");
}

/** Lista segura para UI admin: só metadados, nunca snapshot. */
export function toAdminVisibleProfile(p: {
  id: string;
  name: string;
  displayName?: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
}): {
  id: string;
  name: string;
  displayName?: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    kind: p.kind,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
