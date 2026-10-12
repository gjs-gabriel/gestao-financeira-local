# Sobe o AVD Moto_G60 e o app neste PC (sem celular).
$ErrorActionPreference = "Stop"
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$avd = "Moto_G60"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$sdk\platform-tools;$sdk\emulator;$env:PATH"

if (-not (Test-Path "$sdk\emulator\emulator.exe")) {
  throw "Android SDK emulator nao encontrado em $sdk. Abra o Android Studio > SDK Manager."
}

# Smoke: hypervisor (AEHD). Sem aceleracao o emulador x86_64 aborta no Windows.
$accel = & "$sdk\emulator\emulator.exe" -accel-check 2>&1 | Out-String
if ($accel -match "is not installed|not available|DISABLED") {
  Write-Host $accel
  throw @"
Falta o Android Emulator hypervisor driver (AEHD).
No Android Studio: Settings > Android SDK > SDK Tools >
marque 'Android Emulator hypervisor driver' e instale (admin).
Doc: https://developer.android.com/studio/run/emulator-acceleration#vm-windows
"@
}

$avds = & "$sdk\emulator\emulator.exe" -list-avds 2>$null
if ($avds -notcontains $avd) {
  throw "AVD '$avd' nao existe. Crie pelo Device Manager ou rode o setup do projeto."
}

$devices = & adb devices 2>$null | Select-String "device$"
if (-not $devices) {
  Write-Host "Iniciando emulador $avd..."
  Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList @(
    "-avd", $avd, "-netdelay", "none", "-netspeed", "full"
  )
  Write-Host "Aguardando boot..."
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 3
    $boot = & adb shell getprop sys.boot_completed 2>$null
    $ready = ($boot -match "1")
  } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) { throw "Timeout aguardando o emulador." }
}

Write-Host "Compilando e instalando no emulador (expo run:android)..."
Set-Location $PSScriptRoot\..
npx expo run:android
