param(
  [string]$SetupPath,
  [int]$InstallTimeoutSeconds = 3600,
  [int]$SmokeTimeoutSeconds = 180
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StartedAt = Get-Date

if (-not $SetupPath) {
  $dir = Join-Path $Root 'out\make\squirrel.windows\x64'
  $setup = Get-Item -Path (Join-Path $dir 'EDIT-AI-Setup.exe') -ErrorAction SilentlyContinue
  if (-not $setup) { throw 'EDIT-AI-Setup.exe nao encontrado.' }
  $SetupPath = $setup.FullName
} else {
  $SetupPath = (Resolve-Path $SetupPath).Path
}

Write-Host "[EDIT AI] instalando via Squirrel: $SetupPath"
$setupProcess = Start-Process -FilePath $SetupPath -ArgumentList @('--silent') -PassThru
$deadline = (Get-Date).AddSeconds($InstallTimeoutSeconds)
$installRoot = $null
$appExe = $null
$report = Join-Path $Root 'out\editai-installed-smoke.json'
$smokePassed = $false
$lastAttempt = [DateTime]::MinValue
while ((Get-Date) -lt $deadline -and -not $smokePassed) {
  $roots = @(
    (Join-Path $env:LOCALAPPDATA 'EditAI'),
    (Join-Path $env:LOCALAPPDATA 'EDIT AI'),
    (Join-Path $env:LOCALAPPDATA 'edit_ai')
  ) | Where-Object { Test-Path $_ }

  if (-not $roots.Count) {
    $roots = @(Get-ChildItem -Path $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -ge $StartedAt.AddMinutes(-1) -and (Test-Path (Join-Path $_.FullName 'Update.exe')) } |
      Select-Object -ExpandProperty FullName)
  }

  foreach ($candidateRoot in $roots) {
    $appDir = Get-ChildItem -Path $candidateRoot -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | Select-Object -First 1
    if (-not $appDir) { continue }
    $candidateExe = Get-ChildItem -Path $appDir.FullName -File -Filter '*.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch '^(Update|Squirrel)' } |
      Sort-Object Length -Descending | Select-Object -First 1
    if ($candidateExe) {
      $installRoot = $candidateRoot
      $appExe = $candidateExe.FullName
      break
    }
  }

  if ($appExe -and ((Get-Date) - $lastAttempt).TotalSeconds -ge 15) {
    # O Setup pode abrir o app; encerra apenas processos do diretorio instalado
    # antes de testar. O updater fica vivo enquanto termina a extracao.
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        if ($_.Path -and $_.Path.StartsWith($installRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
          Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
      } catch {}
    }
    Start-Sleep -Seconds 1
    $lastAttempt = Get-Date
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'editai-smoke-windows.ps1') -ExecutablePath $appExe -OutputPath $report -TimeoutSeconds $SmokeTimeoutSeconds
    if ($LASTEXITCODE -eq 0) {
      $smokePassed = $true
      break
    }
    Write-Host '[EDIT AI] instalacao ainda incompleta; repetindo smoke em 15s.'
  }

  if ($setupProcess.HasExited -and $setupProcess.ExitCode -ne 0 -and -not $appExe) {
    throw "Setup falhou (exit $($setupProcess.ExitCode))."
  }
  Start-Sleep -Seconds 2
}
if (-not $smokePassed) {
  try { if (-not $setupProcess.HasExited) { $setupProcess.Kill() } } catch {}
  throw "Instalacao/smoke excedeu ${InstallTimeoutSeconds}s."
}
try { if (-not $setupProcess.HasExited) { $setupProcess.Kill() } } catch {}

$summary = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  setup = $SetupPath
  installRoot = $installRoot
  executable = $appExe
  runtimeSmokeReport = $report
  ok = $true
}
$summaryPath = Join-Path $Root 'out\editai-install-smoke.json'
$summary | ConvertTo-Json -Depth 5 | Set-Content -Path $summaryPath -Encoding UTF8
Write-Host "[EDIT AI] install smoke PASS: $appExe"
Write-Host "[EDIT AI] relatorio: $summaryPath"
