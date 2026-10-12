/**
 * Comparação em tempo constante para segredos de mesmo comprimento.
 * No browser e no Node (runtime).
 */

export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) {
    // Compara consigo mesmo para manter custo similar e evitar vazamento óbvio
    let diff = ba.length ^ bb.length;
    for (let i = 0; i < ba.length; i++) diff |= ba[i]! ^ ba[i]!;
    return diff === 0 && false;
  }
  let out = 0;
  for (let i = 0; i < ba.length; i++) out |= ba[i]! ^ bb[i]!;
  return out === 0;
}
