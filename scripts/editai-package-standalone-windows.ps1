param(
  [string]$PackageDirectory = 'out\EDIT AI-fat-win32-x64',
  [string]$SmokeReportPath = 'out\editai-smoke.json',
  [string]$EvidencePath = 'out\editai-standalone-evidence.json'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

$PackageDirectory = (Resolve-Path $PackageDirectory).Path
$Executable = Join-Path $PackageDirectory 'EDIT AI.exe'
if (-not (Test-Path $Executable -PathType Leaf)) {
  throw 'Pacote standalone sem EDIT AI.exe.'
}

$SmokeReportPath = (Resolve-Path $SmokeReportPath).Path
$Smoke = Get-Content $SmokeReportPath -Raw | ConvertFrom-Json
if (-not $Smoke.ok) { throw 'O smoke do pacote standalone nao esta aprovado.' }

$RuntimeRoot = Join-Path $PackageDirectory 'resources\runtimes\win32-x64'
$RequiredRuntimeFiles = @(
  'ffmpeg\bin\ffmpeg.exe',
  'ffmpeg\bin\ffprobe.exe',
  'node\node.exe',
  'uv\bin\uv.exe',
  'yt-dlp\bin\yt-dlp.exe',
  'codex-app-server\bin\codex-app-server.exe',
  'python-whisperx\python\python.exe'
)
foreach ($RelativePath in $RequiredRuntimeFiles) {
  if (-not (Test-Path (Join-Path $RuntimeRoot $RelativePath) -PathType Leaf)) {
    throw "Runtime obrigatorio ausente no standalone: $RelativePath"
  }
}

Copy-Item LICENSE (Join-Path $PackageDirectory 'LICENSE.txt') -Force
Copy-Item EDITAI_THIRD_PARTY_NOTICE.txt (Join-Path $PackageDirectory 'EDITAI-THIRD-PARTY-NOTICE.txt') -Force

$Launcher = @'
@echo off
cd /d "%~dp0"
start "" "EDIT AI.exe"
'@
Set-Content (Join-Path $PackageDirectory 'INICIAR-EDIT-AI.cmd') $Launcher -Encoding Ascii

$Readme = @'
EDIT AI 1.0 RC2 - WINDOWS X64 STANDALONE

COMO ABRIR
1. Extraia todo o ZIP para uma pasta local.
2. Execute INICIAR-EDIT-AI.cmd ou EDIT AI.exe.
3. No primeiro uso, mantenha a internet conectada para o aplicativo preparar
   o modelo de transcricao e o motor Remotion. Os runtimes principais ja estao
   dentro desta pasta e nao dependem do CDN do EDIT AI.

NAO execute diretamente de dentro do ZIP. Extraia todos os arquivos primeiro.

Este RC2 preserva a licenca MIT do Edvid Desktop e os avisos de terceiros.
O binario de QA nao possui assinatura comercial; o Windows SmartScreen pode
mostrar Editor desconhecido. Use Mais informacoes > Executar assim mesmo.
'@
Set-Content (Join-Path $PackageDirectory 'LEIA-ME-PRIMEIRO.txt') $Readme -Encoding UTF8

$PackageBytes = (Get-ChildItem $PackageDirectory -Recurse -File | Measure-Object Length -Sum).Sum
$Evidence = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  productName = 'EDIT AI'
  version = '1.0.0-editai.2'
  format = 'windows-x64-standalone-full-runtime'
  executable = 'EDIT AI.exe'
  executableSha256 = (Get-FileHash $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
  packageBytes = $PackageBytes
  runtimeRoot = 'resources/runtimes/win32-x64'
  requiredRuntimeFiles = $RequiredRuntimeFiles
  packagedSmoke = $true
  runtimeCount = @($Smoke.runtimes).Count
  firstBootNetwork = @('Whisper model', 'Remotion dependencies', 'Remotion browser', 'fonts')
  codeSigned = $false
}
$Evidence | ConvertTo-Json -Depth 6 | Set-Content $EvidencePath -Encoding UTF8
Copy-Item $EvidencePath (Join-Path $PackageDirectory 'EDITAI-STANDALONE-EVIDENCE.json') -Force

Write-Host "[EDIT AI] standalone pronto: $PackageDirectory"
Write-Host "[EDIT AI] executavel SHA-256: $($Evidence.executableSha256)"
Write-Host "[EDIT AI] tamanho: $PackageBytes bytes"
