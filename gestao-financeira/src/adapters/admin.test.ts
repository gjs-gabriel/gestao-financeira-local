import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertAdminCanEditTarget,
  assertAdminCanWipeTarget,
  toAdminVisibleProfile,
  ADMIN_PROFILE_ID,
  ADMIN_VAULT_ID,
} from "@/domain/admin-profile";
import { buildAdminProfile } from "@/adapters/admin-seed";
import { buildUserProfile } from "@/adapters/profiles";
import { createEmptySnapshot } from "@/domain";
import { encryptSnapshot, decryptEnvelope } from "@/adapters/crypto";

describe("política admin", () => {
  it("permite admin apagar usuário pessoal/demo", () => {
    assert.doesNotThrow(() =>
      assertAdminCanWipeTarget({
        actorKind: "admin",
        actorId: ADMIN_PROFILE_ID,
        targetId: "prof_user",
        targetKind: "personal",
      }),
    );
  });

  it("bloqueia não-admin", () => {
    assert.throws(() =>
      assertAdminCanWipeTarget({
        actorKind: "personal",
        actorId: "prof_user",
        targetId: "prof_other",
        targetKind: "personal",
      }),
    );
  });

  it("bloqueia autoexclusão pelo fluxo admin", () => {
    assert.throws(() =>
      assertAdminCanWipeTarget({
        actorKind: "admin",
        actorId: ADMIN_PROFILE_ID,
        targetId: ADMIN_PROFILE_ID,
        targetKind: "admin",
      }),
    );
  });

  it("bloqueia apagar outro admin", () => {
    assert.throws(() =>
      assertAdminCanWipeTarget({
        actorKind: "admin",
        actorId: ADMIN_PROFILE_ID,
        targetId: "prof_admin_2",
        targetKind: "admin",
      }),
    );
  });

  it("permite admin editar nome/login de usuário pessoal", () => {
    assert.doesNotThrow(() =>
      assertAdminCanEditTarget({
        actorKind: "admin",
        actorId: ADMIN_PROFILE_ID,
        targetId: "prof_user",
        targetKind: "personal",
      }),
    );
  });

  it("bloqueia edição de outro admin", () => {
    assert.throws(() =>
      assertAdminCanEditTarget({
        actorKind: "admin",
        actorId: ADMIN_PROFILE_ID,
        targetId: "prof_admin_2",
        targetKind: "admin",
      }),
    );
  });

  it("bloqueia edição por não-admin", () => {
    assert.throws(() =>
      assertAdminCanEditTarget({
        actorKind: "personal",
        actorId: "prof_user",
        targetId: "prof_other",
        targetKind: "personal",
      }),
    );
  });

  it("metadados públicos não incluem vaultId", () => {
    const p = buildUserProfile({
      name: "Ana",
      login: "ana.costa",
      kind: "personal",
    });
    const visible = toAdminVisibleProfile(p);
    assert.equal(visible.name, "Ana");
    assert.equal("vaultId" in visible, false);
  });

  it("buildAdminProfile usa IDs estáveis e kind admin", () => {
    const p = buildAdminProfile();
    assert.equal(p.id, ADMIN_PROFILE_ID);
    assert.equal(p.vaultId, ADMIN_VAULT_ID);
    assert.equal(p.kind, "admin");
  });
});

describe("isolamento crypto admin × usuário", () => {
  it("PIN do admin não abre cofre de outro usuário", async () => {
    const userSnap = createEmptySnapshot();
    userSnap.incomes.push({
      id: "secret-income",
      type: "salary",
      name: "Salário confidencial",
      amount: 12345,
      createdAt: userSnap.updatedAt,
      updatedAt: userSnap.updatedAt,
    });
    const adminSnap = createEmptySnapshot();

    const userEnv = await encryptSnapshot(userSnap, "user-pin-9999");
    const adminEnv = await encryptSnapshot(adminSnap, "admin-pin-1111");

    await assert.rejects(() => decryptEnvelope(userEnv, "admin-pin-1111"));
    const openedAdmin = await decryptEnvelope(adminEnv, "admin-pin-1111");
    assert.equal(
      openedAdmin.incomes.some((i) => i.id === "secret-income"),
      false,
    );
  });

  it("wipe conceitual: autenticar admin sem decrypt da vítima", async () => {
    const victim = await encryptSnapshot(createEmptySnapshot(), "victim-pin");
    const admin = await encryptSnapshot(createEmptySnapshot(), "admin-pin");
    await decryptEnvelope(admin, "admin-pin");
    await assert.rejects(() => decryptEnvelope(victim, "admin-pin"));
  });
});
