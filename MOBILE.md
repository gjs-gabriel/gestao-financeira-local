# Versão mobile — teste no PC

- App: [`apps/mobile`](apps/mobile)
- Domínio: [`packages/gf-core`](packages/gf-core)
- Desktop: [`gestao-financeira`](gestao-financeira) — **intacta**

## Cofre `.gfin` no mobile

- **Crypto:** `apps/mobile/src/adapters/crypto.native.ts` — PBKDF2/AES-GCM via `react-native-quick-crypto` (JSI); fallback `@noble` no Expo Go.
- **Storage:** `apps/mobile/src/adapters/storage.native.ts` — envelope em `documentDirectory/vaults/*.gfin` (migra AsyncStorage legado).
- **UX:** tela de PIN com overlay “Abrindo cofre…” durante o KDF.

Para KDF nativo rápido (não Expo Go): `cd apps/mobile && npx expo run:android`.

## Fluxo (só neste PC, sem celular)

1. Instalar **Android Emulator hypervisor driver (AEHD)** no Android Studio (SDK Tools) — sem isso o emulador não sobe no Windows.
2. Ligar o AVD **`Moto_G60`** (Device Manager).
3. `npm run mobile:emulator` ou `cd apps/mobile && npx expo run:android`

Detalhes: [`apps/mobile/README.md`](apps/mobile/README.md).
