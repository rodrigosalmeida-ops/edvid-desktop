param(
  [string]$SetupPath,
  [int]$InstallTimeoutSeconds = 3600,
  [int]$SmokeTimeoutSeconds = 180,
  [int]$BootstrapTimeoutSeconds = 300,
  [string]$RuntimeSource,
  [switch]$DownloadRuntimePack
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
$bootstrapDeadline = (Get-Date).AddSeconds($BootstrapTimeoutSeconds)
$installRoot = $null
$appExe = $null
$report = Join-Path $Root 'out\editai-installed-smoke.json'
$diagnostics = Join-Path $Root 'out\editai-squirrel-diagnostics'
$squirrelTemp = Join-Path $env:LOCALAPPDATA 'SquirrelTemp'
$squirrelLog = Join-Path $squirrelTemp 'SquirrelSetup.log'
$installMode = 'setup-bootstrapper'
$directUpdaterStarted = $false
$smokePassed = $false
$lastAttempt = [DateTime]::MinValue
$runtimeHydrated = $false
$runtimePreparationChecked = $false
New-Item -ItemType Directory -Force -Path $diagnostics | Out-Null
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

  if (-not $appExe -and -not $directUpdaterStarted -and (Get-Date) -ge $bootstrapDeadline) {
    # Setup.exe apenas extrai Update.exe e o chama com `--install .`. Em runners
    # Windows o bootstrapper pode ficar preso lendo o payload embutido. Copia o
    # mesmo updater oficial e aponta-o para RELEASES/.nupkg ja verificados.
    $embeddedUpdater = Join-Path $squirrelTemp 'Update.exe'
    if (Test-Path $embeddedUpdater) {
      $directUpdater = Join-Path $env:TEMP 'editai-squirrel-update.exe'
      Copy-Item -Force $embeddedUpdater $directUpdater
      if (Test-Path $squirrelLog) {
        Copy-Item -Force $squirrelLog (Join-Path $diagnostics 'SquirrelSetup-bootstrapper.log')
        Write-Host '[EDIT AI] bootstrapper Squirrel nao progrediu; ultimas linhas:'
        Get-Content $squirrelLog -Tail 80 -ErrorAction SilentlyContinue | Write-Host
      }
      Get-Process -Name 'Update' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      try { if (-not $setupProcess.HasExited) { $setupProcess.Kill() } } catch {}
      $releaseDirectory = Split-Path -Parent $SetupPath
      Write-Host "[EDIT AI] retry Squirrel direto em: $releaseDirectory"
      $setupProcess = Start-Process -FilePath $directUpdater -ArgumentList @('--install', $releaseDirectory, '--silent') -WorkingDirectory $releaseDirectory -PassThru
      $directUpdaterStarted = $true
      $installMode = 'update-exe-release-directory'
    }
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
    if (-not $runtimePreparationChecked) {
      if (-not $RuntimeSource -and -not $DownloadRuntimePack) {
        $defaultRuntimeSource = Join-Path $Root 'resources\runtimes\win32-x64'
        if (Test-Path $defaultRuntimeSource) { $RuntimeSource = $defaultRuntimeSource }
      }
      if ($RuntimeSource) {
        $RuntimeSource = (Resolve-Path $RuntimeSource).Path
        $runtimeDestination = Join-Path (Split-Path -Parent $appExe) 'resources\runtimes\win32-x64'
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtimeDestination) | Out-Null
        if (-not (Test-Path $runtimeDestination)) {
          try {
            New-Item -ItemType Junction -Path $runtimeDestination -Target $RuntimeSource -ErrorAction Stop | Out-Null
            Write-Host "[EDIT AI] runtime QA verificado conectado por junction: $runtimeDestination"
          } catch {
            New-Item -ItemType Directory -Force -Path $runtimeDestination | Out-Null
            & robocopy $RuntimeSource $runtimeDestination /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /MT:16 /NFL /NDL /NJH /NJS
            if ($LASTEXITCODE -gt 7) { throw "Falha ao hidratar runtime QA via robocopy (exit $LASTEXITCODE)." }
            Write-Host "[EDIT AI] runtime QA verificado copiado: $runtimeDestination"
          }
        }
        $runtimeHydrated = $true
      }
      $runtimePreparationChecked = $true
    }
    # O Setup pode abrir o app. Encerra apenas esse executavel antes do smoke;
    # Update.exe/Squirrel precisam continuar vivos ate finalizar a extracao.
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        if ($_.Path -and $_.Path.Equals($appExe, [System.StringComparison]::OrdinalIgnoreCase)) {
          Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
      } catch {}
    }
    Start-Sleep -Seconds 1
    $lastAttempt = Get-Date
    $smokeArguments = @(
      '-ExecutionPolicy', 'Bypass',
      '-File', (Join-Path $PSScriptRoot 'editai-smoke-windows.ps1'),
      '-ExecutablePath', $appExe,
      '-OutputPath', $report,
      '-TimeoutSeconds', $SmokeTimeoutSeconds
    )
    if ($DownloadRuntimePack) { $smokeArguments += '-EnsureRuntimePack' }
    & powershell @smokeArguments
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
  if (Test-Path $squirrelLog) {
    Copy-Item -Force $squirrelLog (Join-Path $diagnostics 'SquirrelSetup-final.log')
    Get-Content $squirrelLog -Tail 120 -ErrorAction SilentlyContinue | Write-Host
  }
  try { if (-not $setupProcess.HasExited) { $setupProcess.Kill() } } catch {}
  throw "Instalacao/smoke excedeu ${InstallTimeoutSeconds}s."
}
try { if (-not $setupProcess.HasExited) { $setupProcess.Kill() } } catch {}
if (Test-Path $squirrelLog) {
  Copy-Item -Force $squirrelLog (Join-Path $diagnostics 'SquirrelSetup-success.log')
}

$summary = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  setup = $SetupPath
  installRoot = $installRoot
  executable = $appExe
  installMode = $installMode
  runtimeHydrated = $runtimeHydrated
  runtimeSmokeReport = $report
  ok = $true
}
$summaryPath = Join-Path $Root 'out\editai-install-smoke.json'
$summary | ConvertTo-Json -Depth 5 | Set-Content -Path $summaryPath -Encoding UTF8
Write-Host "[EDIT AI] install smoke PASS: $appExe"
Write-Host "[EDIT AI] relatorio: $summaryPath"
