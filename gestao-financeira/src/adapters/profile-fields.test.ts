import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertUniqueLogin,
  validateDisplayName,
  validateLogin,
} from "./profile-fields";

describe("validateDisplayName", () => {
  it("aceita nome com espaços", () => {
    const r = validateDisplayName("  João Silva  ");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, "João Silva");
  });

  it("rejeita nome curto", () => {
    const r = validateDisplayName("A");
    assert.equal(r.ok, false);
  });
});

describe("validateLogin", () => {
  it("aceita login válido", () => {
    const r = validateLogin("joao.silva");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, "joao.silva");
  });

  it("rejeita espaços entre palavras", () => {
    const r = validateLogin("joao silva");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /espaços/i);
  });

  it("rejeita começo com número", () => {
    const r = validateLogin("1joao");
    assert.equal(r.ok, false);
  });

  it("normaliza maiúsculas", () => {
    const r = validateLogin("Joao.Silva");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value, "joao.silva");
  });
});

describe("assertUniqueLogin", () => {
  it("detecta conflito", () => {
    assert.throws(() =>
      assertUniqueLogin("ana", [
        { id: "1", displayName: "ana" },
        { id: "2", displayName: "bob" },
      ]),
    );
  });

  it("permite mesmo login no próprio perfil", () => {
    assert.doesNotThrow(() =>
      assertUniqueLogin(
        "ana",
        [{ id: "1", displayName: "ana" }],
        "1",
      ),
    );
  });
});
