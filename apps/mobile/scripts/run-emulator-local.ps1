# Sobe o AVD "Moto G60" e o app Expo só neste PC (sem celular / sem QR).
$ErrorActionPreference = "Stop"

$Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$env:PATH = "$Sdk\platform-tools;$Sdk\emulator;$env:PATH"

$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emulator = Join-Path $Sdk "emulator\emulator.exe"
# Perfil visual Moto G60 (1080x2460); AVD usa o device já instalado no Android Studio.
$AvdName = if ($env:GF_ANDROID_AVD) { $env:GF_ANDROID_AVD } else { "Medium_Phone_API_37.0" }
$MobileRoot = Split-Path $PSScriptRoot -Parent

function Get-BootedDevice {
  & $Adb devices | Select-String "device$" | ForEach-Object {
    ($_ -split "\s+")[0]
  } | Where-Object { $_ -and $_ -ne "List" }
}

$devices = @(Get-BootedDevice)
if ($devices.Count -eq 0) {
  Write-Host "Iniciando emulador $AvdName ..."
  Start-Process -FilePath $Emulator -ArgumentList @("-avd", $AvdName, "-netdelay", "none", "-netspeed", "full") -WindowStyle Normal
  Write-Host "Aguardando boot do Android..."
  & $Adb wait-for-device
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 3
    $boot = & $Adb shell getprop sys.boot_completed 2>$null
    if ((Get-Date) -gt $deadline) { throw "Timeout esperando o emulador bootar." }
  } while (($boot | Out-String).Trim() -ne "1")
  Write-Host "Emulador pronto."
} else {
  Write-Host "Emulador já ligado: $($devices -join ', ')"
}

# Metro só no PC (adb reverse) — não depende de Wi-Fi/celular
Set-Location $MobileRoot
Write-Host "Abrindo app no emulador (localhost)..."
npx expo start --localhost --android --port 8081
