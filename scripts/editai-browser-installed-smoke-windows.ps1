param(
  [string]$ExecutablePath,
  [int]$TimeoutSeconds = 180,
  [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $ExecutablePath) {
  $installReport = Join-Path $Root 'out\editai-install-smoke.json'
  if (-not (Test-Path $installReport)) { throw 'Relatorio de instalacao ausente.' }
  $ExecutablePath = (Get-Content $installReport -Raw | ConvertFrom-Json).executable
}
$ExecutablePath = (Resolve-Path $ExecutablePath -ErrorAction Stop).Path
if (-not $OutputPath) { $OutputPath = Join-Path $Root 'out\editai-browser-installed-smoke.json' }
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath -Parent) | Out-Null
Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue

# Garante que o teste mede um boot novo do executavel instalado.
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    if ($_.Path -and $_.Path.Equals($ExecutablePath, [System.StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}
Start-Sleep -Seconds 1
$process = Start-Process -FilePath $ExecutablePath -PassThru
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$origin = $null
$title = $null
while ((Get-Date) -lt $deadline -and -not $origin) {
  foreach ($port in 4820..4829) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/" -TimeoutSec 2
      if ($response.StatusCode -eq 200 -and $response.Content -match 'EDIT AI') {
        $origin = "http://127.0.0.1:$port"
        $title = 'EDIT AI'
        break
      }
    } catch {}
  }
  if (-not $origin) {
    if ($process.HasExited) { throw "EDIT AI encerrou antes de iniciar o navegador local (exit $($process.ExitCode))." }
    Start-Sleep -Seconds 2
  }
}
if (-not $origin) {
  try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
  throw "EDIT AI instalado nao iniciou browser-local em ${TimeoutSeconds}s."
}

# Browser-only significa que o motor Electron continua vivo, mas sua janela
# nativa deve permanecer escondida; o usuario trabalha somente no navegador.
Start-Sleep -Seconds 2
$native = Get-Process -Id $process.Id -ErrorAction Stop
if ($native.MainWindowHandle -ne 0 -and $native.MainWindowTitle) {
  throw "UI Electron ficou visivel em modo browser-only: $($native.MainWindowTitle)"
}

$report = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  executable = $ExecutablePath
  origin = $origin
  browserOnly = $true
  nativeWindowVisible = $false
  ok = $true
}
$report | ConvertTo-Json -Depth 4 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host "[EDIT AI] browser-only instalado PASS: $origin"
Write-Host "[EDIT AI] relatorio: $OutputPath"
try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch {}
