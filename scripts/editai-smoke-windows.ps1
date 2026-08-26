param(
  [string]$ExecutablePath,
  [string]$OutputPath,
  [int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Resolve-EditAiExecutable {
  param([string]$ExplicitPath)
  if ($ExplicitPath) {
    $resolved = (Resolve-Path $ExplicitPath -ErrorAction Stop).Path
    if (-not (Test-Path $resolved -PathType Leaf)) { throw "Executável inválido: $resolved" }
    return $resolved
  }
  $candidates = @(Get-ChildItem -Path (Join-Path $Root 'out') -Recurse -File -Filter '*.exe' -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -notmatch '^(Setup|Update|Squirrel|WriteZipToSetup)' -and
      $_.FullName -notmatch '\\make\\squirrel\.windows\\'
    } |
    Sort-Object Length -Descending)
  if ($candidates.Count -lt 1) { throw 'Executável empacotado do EDIT AI não encontrado em out/.' }
  return $candidates[0].FullName
}

$Exe = Resolve-EditAiExecutable $ExecutablePath
if (-not $OutputPath) { $OutputPath = Join-Path $Root 'out\editai-smoke.json' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath -Parent) | Out-Null
Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue

Write-Host "[EDIT AI] smoke executável: $Exe"
$arg = "--editai-smoke-output=$OutputPath"
$process = Start-Process -FilePath $Exe -ArgumentList @('--editai-smoke', $arg) -PassThru
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
  try { $process.Kill() } catch {}
  throw "Smoke test excedeu ${TimeoutSeconds}s."
}
if ($process.ExitCode -ne 0) { throw "EDIT AI smoke falhou (exit $($process.ExitCode))." }
if (-not (Test-Path $OutputPath)) { throw "Relatório smoke não foi gerado: $OutputPath" }

$report = Get-Content -Raw $OutputPath | ConvertFrom-Json
if (-not $report.ok) { throw 'Relatório smoke marcou ok=false.' }
$required = @('node','npm','ffmpeg','ffprobe','uv','yt-dlp','python','whisperx')
foreach ($name in $required) {
  $item = @($report.runtimes | Where-Object { $_.name -eq $name }) | Select-Object -First 1
  if (-not $item) { throw "Runtime ausente no relatório: $name" }
  if (-not $item.available) { throw "Runtime indisponível: $name — $($item.error)" }
}
Write-Host "[EDIT AI] smoke PASS — $($required.Count) runtimes disponíveis."
Write-Host "[EDIT AI] relatório: $OutputPath"
