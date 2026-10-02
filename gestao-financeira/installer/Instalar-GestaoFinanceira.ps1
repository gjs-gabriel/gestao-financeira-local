# Instalador do Gestão Financeira (Windows).
# Coloca Node.js LTS (inclui npm), Ollama e o modelo qwen2.5:1.5b
# se ainda não estiverem utilizáveis. Cria o atalho da área de trabalho.
# Não compila o aplicativo.

$ErrorActionPreference = "Stop"

$ModelName = "qwen2.5:1.5b"
$MinNodeMajor = 20
$WingetAlreadyInstalled = -1978335189
$script:PauseOnClose = $true

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Test-NodeOk {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { return $false }
  $raw = (& node -v 2>&1 | Out-String)
  if ($raw -notmatch "v(\d+)") { return $false }
  if ([int]$Matches[1] -lt $MinNodeMajor) { return $false }
  & npm -v 1>$null 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Resolve-OllamaExe {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Resolve-OllamaApp {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama app.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Test-OllamaApi {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 3
    return ($response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Wait-OllamaApi {
  param([int]$Seconds = 90)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-OllamaApi) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Install-WingetId {
  param([string]$Id)
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "winget não encontrado. Instale o App Installer pela Microsoft Store e execute Instalar.cmd de novo."
  }
  Write-Host "Instalando $Id ..."
  & winget install --id $Id -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  $code = $LASTEXITCODE
  if ($code -ne 0 -and $code -ne $WingetAlreadyInstalled) {
    Write-Host "winget retornou $code para $Id. A instalação segue se a ferramenta estiver no PATH."
  }
}

function Start-OllamaIfNeeded {
  if (Test-OllamaApi) {
    Write-Host "Ollama já responde em 127.0.0.1:11434."
    return
  }
  $app = Resolve-OllamaApp
  if ($app) {
    Write-Host "Iniciando Ollama..."
    Start-Process -FilePath $app -WindowStyle Hidden
  } else {
    $exe = Resolve-OllamaExe
    if (-not $exe) { throw "Ollama instalado, mas o executável não foi encontrado." }
    Write-Host "Iniciando Ollama..."
    Start-Process -FilePath $exe -ArgumentList "serve" -WindowStyle Hidden
  }
  if (-not (Wait-OllamaApi -Seconds 90)) {
    throw "Ollama não respondeu em 127.0.0.1:11434."
  }
}

function Test-ModelPresent {
  param([string]$Exe, [string]$Name)
  $out = & $Exe list 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { return $false }
  return ($out -match [regex]::Escape($Name))
}

function Resolve-PackageRoot {
  $here = $PSScriptRoot
  $beside = Join-Path $here "GestaoFinanceira.vbs"
  if (Test-Path -LiteralPath $beside) { return $here }
  $dist = Join-Path $here "..\dist\GestaoFinanceira\GestaoFinanceira.vbs"
  if (Test-Path -LiteralPath $dist) {
    return (Resolve-Path (Split-Path -Parent $dist)).Path
  }
  throw "GestaoFinanceira.vbs não encontrado. Rode npm run package:windows antes de instalar."
}

function New-DesktopShortcut {
  param([string]$Root)
  $target = Join-Path $Root "GestaoFinanceira.vbs"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $lnkPath = Join-Path $desktop "Gestão Financeira.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath = "wscript.exe"
  $lnk.Arguments = '"' + $target + '"'
  $lnk.WorkingDirectory = $Root
  $lnk.WindowStyle = 7
  $lnk.Description = "Gestão Financeira"
  $lnk.Save()
  Write-Host "Atalho criado: $lnkPath"
}

function Wait-Close {
  Write-Host ""
  Write-Host "Pressione Enter para fechar."
  [void](Read-Host)
}

try {
  Write-Host "Gestão Financeira — instalador"
  Write-Host "Ferramentas: Node.js LTS (node, npm, npx), Ollama, modelo $ModelName"
  Write-Host ""

  Refresh-SessionPath
  $needNode = -not (Test-NodeOk)
  $needOllama = -not (Resolve-OllamaExe)

  if (($needNode -or $needOllama) -and -not (Test-IsAdmin)) {
    Write-Host "É preciso permissão de administrador para instalar Node.js e/ou Ollama."
    $argList = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $PSCommandPath
    )
    $proc = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -Wait -PassThru
    $script:PauseOnClose = $false
    if ($null -ne $proc.ExitCode -and $proc.ExitCode -ne 0) { exit $proc.ExitCode }
    exit 0
  }

  if ($needNode) {
    Install-WingetId -Id "OpenJS.NodeJS.LTS"
    Refresh-SessionPath
    if (-not (Test-NodeOk)) {
      throw "Node.js LTS (com npm) não ficou disponível após a instalação. Feche e abra o instalador de novo."
    }
  } else {
    Write-Host "Node.js e npm já estão utilizáveis. Nada a reinstalar."
  }

  if ($needOllama) {
    Install-WingetId -Id "Ollama.Ollama"
    Refresh-SessionPath
    if (-not (Resolve-OllamaExe)) {
      throw "Ollama não ficou disponível após a instalação. Feche e abra o instalador de novo."
    }
  } else {
    Write-Host "Ollama já está instalado. Nada a reinstalar."
  }

  $root = Resolve-PackageRoot
  Start-OllamaIfNeeded

  $ollamaExe = Resolve-OllamaExe
  if (-not $ollamaExe) { throw "ollama.exe não encontrado." }

  if (Test-ModelPresent -Exe $ollamaExe -Name $ModelName) {
    Write-Host "Modelo $ModelName já está instalado."
  } else {
    Write-Host "Baixando modelo $ModelName (pode demorar)..."
    & $ollamaExe pull $ModelName
    if ($LASTEXITCODE -ne 0) { throw "ollama pull $ModelName falhou (código $LASTEXITCODE)." }
  }

  New-DesktopShortcut -Root $root

  Write-Host ""
  Write-Host "Instalação concluída. Abra o atalho Gestão Financeira na área de trabalho."
  exit 0
} catch {
  Write-Host ""
  Write-Host "Falha: $($_.Exception.Message)"
  exit 1
} finally {
  if ($script:PauseOnClose) { Wait-Close }
}
