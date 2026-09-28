import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createMarinaDemoSnapshot,
  isMarinaDemoSnapshot,
  validateMarinaDemoSnapshot,
  formatMarinaCredentialsBanner,
  MARINA_DEMO_PIN,
  MARINA_DEMO_USERNAME,
  wealthBreakdown,
  createEmptySnapshot,
} from "./index";
import { encryptSnapshot as enc, decryptEnvelope as dec } from "../adapters/crypto";

describe("marina demo persona", () => {
  const anchor = new Date("2026-09-15T12:00:00.000Z");

  it("gera narrativa completa e passa validação", () => {
    const s = createMarinaDemoSnapshot(anchor);
    assert.equal(isMarinaDemoSnapshot(s), true);
    const v = validateMarinaDemoSnapshot(s);
    assert.equal(v.ok, true, v.issues.join("; "));
    assert.ok(s.accounts.length >= 3);
    assert.ok(s.incomes.some((i) => i.amount === 9200));
    assert.ok(s.goals.some((g) => g.name.includes("apartamento")));
    assert.ok(s.goals.some((g) => g.name.includes("emergência")));
    assert.ok(s.debts.some((d) => d.balance === 31000));
    assert.ok(s.oneTimeExpenses.length >= 30);
    assert.ok((s.installmentExpenses ?? []).length >= 3);
    assert.ok((s.creditCards ?? [])[0]?.name.includes("Aurora"));
    assert.ok((s.budgets ?? []).length >= 5);
    const invTotal = s.investments.reduce((a, i) => a + i.amount, 0);
    assert.ok(invTotal >= 57000 && invTotal <= 59000);
  });

  it("é independente do snapshot vazio", () => {
    const empty = createEmptySnapshot(anchor.toISOString());
    const marina = createMarinaDemoSnapshot(anchor);
    assert.equal(isMarinaDemoSnapshot(empty), false);
    assert.notEqual(marina.accounts[0]?.id, empty.accounts[0]?.id);
  });

  it("patrimônio é calculado a partir dos dados", () => {
    const s = createMarinaDemoSnapshot(anchor);
    const w = wealthBreakdown(s);
    assert.ok(Number.isFinite(w.netWorth));
    assert.ok(w.assets > w.liabilities || w.netWorth !== 0);
    assert.ok(w.investments >= 50000);
    assert.ok(w.debts >= 30000);
  });

  it("banner de credenciais inclui PIN e usuário", () => {
    const banner = formatMarinaCredentialsBanner();
    assert.ok(banner.includes(MARINA_DEMO_PIN));
    assert.ok(banner.includes(MARINA_DEMO_USERNAME));
    assert.ok(banner.includes("Marina Costa"));
  });

  it("cofre criptografado abre só com o PIN da Marina", async () => {
    const s = createMarinaDemoSnapshot(anchor);
    const env = await enc(s, MARINA_DEMO_PIN);
    const opened = await dec(env, MARINA_DEMO_PIN);
    assert.equal(isMarinaDemoSnapshot(opened), true);
    await assert.rejects(() => dec(env, "0000"));
  });
});
