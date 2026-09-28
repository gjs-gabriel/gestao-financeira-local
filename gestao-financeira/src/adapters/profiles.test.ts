import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoSnapshot,
  createEmptySnapshot,
} from "../domain/index";
import {
  buildUserProfile,
  planLegacyMigration,
  slugifyProfileName,
} from "./profiles";
import { encryptSnapshot, decryptEnvelope } from "./crypto";

describe("profiles helpers", () => {
  it("slugify gera nome de arquivo seguro", () => {
    assert.equal(slugifyProfileName("Apresentação"), "apresentacao");
    assert.equal(slugifyProfileName("Meu usuário"), "meu-usuario");
    assert.ok(slugifyProfileName("***").length > 0);
  });

  it("buildUserProfile cria vaultId distinto por perfil", () => {
    const a = buildUserProfile({ name: "A", kind: "demo" });
    const b = buildUserProfile({ name: "B", kind: "personal" });
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.vaultId, b.vaultId);
    assert.equal(a.kind, "demo");
    assert.equal(b.kind, "personal");
  });

  it("planLegacyMigration preserva vaultId no profile", () => {
    const { profile, vaultId } = planLegacyMigration({ name: "Meu usuário" });
    assert.equal(profile.vaultId, vaultId);
    assert.equal(profile.name, "Meu usuário");
  });
});

describe("multi-vault crypto isolation", () => {
  it("PIN de A não abre cofre de B", async () => {
    const snapA = createDemoSnapshot(new Date("2026-09-15"));
    const snapB = createEmptySnapshot("2026-09-15T12:00:00.000Z");
    snapB.incomes.push({
      id: "secret",
      type: "salary",
      name: "Salário secreto",
      amount: 99999,
      createdAt: snapB.updatedAt,
      updatedAt: snapB.updatedAt,
    });

    const envA = await encryptSnapshot(snapA, "1234");
    const envB = await encryptSnapshot(snapB, "5678");

    assert.notEqual(envA.kdf.salt, envB.kdf.salt);
    assert.notEqual(envA.cipher.iv, envB.cipher.iv);

    const openedA = await decryptEnvelope(envA, "1234");
    assert.ok(
      openedA.incomes.some((i) => i.id.includes("marina") || i.amount === 9200),
    );

    await assert.rejects(() => decryptEnvelope(envB, "1234"));
    await assert.rejects(() => decryptEnvelope(envA, "5678"));
    await assert.rejects(() => decryptEnvelope(envA, "0000"));

    const openedB = await decryptEnvelope(envB, "5678");
    assert.ok(openedB.incomes.some((i) => i.id === "secret"));
    assert.equal(
      openedB.incomes.some((i) => i.id.includes("marina")),
      false,
    );
  });

  it("changePin (re-encrypt) preserva dados", async () => {
    const snap = createEmptySnapshot("2026-09-15T12:00:00.000Z");
    snap.goals.push({
      id: "g1",
      name: "Meta",
      targetAmount: 1000,
      currentAmount: 100,
      createdAt: snap.updatedAt,
      updatedAt: snap.updatedAt,
    });
    const env1 = await encryptSnapshot(snap, "1111");
    const data = await decryptEnvelope(env1, "1111");
    const env2 = await encryptSnapshot(data, "2222");
    const again = await decryptEnvelope(env2, "2222");
    assert.equal(again.goals[0]!.name, "Meta");
    assert.equal(again.goals[0]!.targetAmount, 1000);
    await assert.rejects(() => decryptEnvelope(env2, "1111"));
  });

  it("salts distintos entre recriptografias", async () => {
    const snap = createEmptySnapshot();
    const a = await encryptSnapshot(snap, "9999");
    const b = await encryptSnapshot(snap, "9999");
    assert.notEqual(a.kdf.salt, b.kdf.salt);
    assert.notEqual(a.cipher.iv, b.cipher.iv);
  });
});

describe("session clear", () => {
  it("estado limpo não expõe snapshot", () => {
    const session = {
      snapshot: null as unknown,
      pin: null as string | null,
    };
    assert.equal(session.snapshot, null);
    assert.equal(session.pin, null);
  });
});
