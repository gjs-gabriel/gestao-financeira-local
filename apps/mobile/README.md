# Gestão Financeira — Mobile

App **paralelo** ao desktop Windows. O cofre `.gfin` e o PIN são os mesmos. O desktop em `gestao-financeira/` **não** é alterado por este app.

## Teste só neste PC (sem celular)

O Android Studio emula um aparelho no perfil **Moto G60** (1080×2460 @ ~400 dpi). AVD: `Moto_G60`.

### Pré-requisito (obrigatório no Windows)

O emulador x86_64 precisa de aceleração de CPU. Sem isso ele aborta com:

`Android Emulator hypervisor driver is not installed`

1. Abra o **Android Studio** → **Settings** → **Languages & Frameworks** → **Android SDK** → aba **SDK Tools**
2. Marque **Android Emulator hypervisor driver** (AEHD) → Apply / Install
3. Se o instalador pedir, rode como administrador
4. Confirme virtualização ligada no BIOS (Intel VT-x / AMD-V)

Doc oficial: https://developer.android.com/studio/run/emulator-acceleration#vm-windows

### Subir o emulador

**Opção A — Android Studio**

1. **Device Manager** → AVD **`Moto_G60`** → Play  
2. Espere a home do Android

**Opção B — script**

```powershell
cd apps/mobile
npm run emulator
```

### Instalar o app no emulador

Não usa o celular. Compila e instala o APK de debug no emulador:

```powershell
cd apps/mobile
npx expo run:android
```

Na raiz do workspace:

```powershell
npm run mobile:emulator
```

Precisa de **JDK 17+** no PATH (o JBR do Android Studio serve; em Settings → Build Tools → Gradle → Gradle JDK costuma aparecer).

### Credenciais de teste

- Perfil: **Marina Costa**
- Login: `marina.demo`
- PIN: `3247`

## O que o app cobre

- Painel, fluxo, patrimônio, contas, rendas, gastos, categorias, metas, etc.
- Inteligência por **regras** (Finn, Analista, alertas, simulação de compra)
- Importação CSV + export/import `.gfin`

Chat LLM / Ollama e Pluggy continuam no desktop Windows.

## Cofre (interop com a web)

| Camada | Arquivo | Notas |
|--------|---------|--------|
| Crypto | `src/adapters/crypto.native.ts` | PBKDF2 310k + AES-256-GCM via `react-native-quick-crypto` (JSI). Fallback `@noble` no Expo Go. |
| Disco | `src/adapters/storage.native.ts` | `.gfin` em `documentDirectory/vaults/`; migra AsyncStorage legado. |
| UX | `app/index.tsx` + `UnlockOverlay` | Overlay “Abrindo cofre…” enquanto deriva a chave. |

`npx expo run:android` (dev build) é necessário para o KDF nativo rápido. Expo Go funciona, mas o PBKDF2 cai no fallback JS.

## Pacote compartilhado

```bash
npm run sync:gf-core
```
