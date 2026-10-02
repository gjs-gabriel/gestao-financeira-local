/** Validação matemática de resumos de extrato — nunca corrige silenciosamente. */

export function validateStatementMath(input: {
  initialBalance: number | null;
  totalCredits: number | null;
  totalDebits: number | null;
  netIncome: number | null;
  finalBalance: number | null;
}): { ok: boolean | null; expected: number | null; detail: string } {
  const {
    initialBalance,
    totalCredits,
    totalDebits,
    netIncome,
    finalBalance,
  } = input;

  if (initialBalance == null || finalBalance == null) {
    return {
      ok: null,
      expected: null,
      detail: "Saldo inicial ou final ausente — validação não aplicável",
    };
  }

  const credits = totalCredits ?? 0;
  const debits = totalDebits ?? 0;
  const income = netIncome ?? 0;
  const expected =
    Math.round((initialBalance + credits - Math.abs(debits) + income) * 100) /
    100;
  const ok = Math.abs(expected - finalBalance) < 0.05;

  return {
    ok,
    expected,
    detail: ok
      ? "Valores conferidos"
      : `Foi encontrada uma inconsistência no documento (esperado ${expected.toFixed(2)}, informado ${finalBalance.toFixed(2)}).`,
  };
}
