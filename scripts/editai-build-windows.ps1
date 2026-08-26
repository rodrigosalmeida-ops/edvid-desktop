param(
  [ValidateSet('qa','release')][string]$Mode = 'qa',
  [switch]$PublishRuntime,
  [switch]$PublishUpdate,
  [switch]$AllowUnsignedRelease
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][scriptblock]$Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label falhou (exit $LASTEXITCODE)." }
}

if ($env:OS -ne 'Windows_NT') { throw 'Este pipeline deve rodar em Windows x64.' }
if ([Environment]::Is64BitOperatingSystem -ne $true) { throw 'Windows 64 bits obrigatório.' }

if (-not (Test-Path 'node_modules')) {
  Write-Host '[EDIT AI] Instalando dependências npm...'
  if (Test-Path 'package-lock.json') {
    Invoke-Checked 'npm ci' { npm ci }
  } else {
    Invoke-Checked 'npm install' { npm install }
  }
}

if ($Mode -eq 'release' -and -not $AllowUnsignedRelease) {
  if (-not $env:EDITAI_WIN_SIGNTOOL -or -not $env:EDITAI_WIN_SIGN_PARAMS) {
    throw 'Release comercial exige assinatura. Configure EDITAI_WIN_SIGNTOOL + EDITAI_WIN_SIGN_PARAMS ou use -AllowUnsignedRelease apenas para teste.'
  }
}

Write-Host '[EDIT AI] 1/10 typecheck + testes principais'
Invoke-Checked 'typecheck' { npm run typecheck }
Invoke-Checked 'test:timeline' { npm run test:timeline }
Invoke-Checked 'test:media' { npm run test:media }
Invoke-Checked 'test:helpers' { npm run test:helpers }
Invoke-Checked 'test:clean-cut' { npm run test:clean-cut }
Invoke-Checked 'test:phase2-data' { npm run test:phase2-data }
Invoke-Checked 'test:edit-data-edits' { npm run test:edit-data-edits }
Invoke-Checked 'release gate QA' { node scripts/verify-editai-release.mjs }

Write-Host '[EDIT AI] 2/10 preparando runtimes do upstream'
Invoke-Checked 'stage:node' { npm run stage:node }
Invoke-Checked 'stage:uv' { npm run stage:uv }
Invoke-Checked 'stage:yt-dlp' { npm run stage:yt-dlp }
Invoke-Checked 'stage:codex' { npm run stage:codex }
Invoke-Checked 'build:ffmpeg' { npm run build:ffmpeg }
Invoke-Checked 'build:ffmpeg:torchcodec' { npm run build:ffmpeg:torchcodec }
Invoke-Checked 'stage:python-whisperx' { npm run stage:python-whisperx }

Write-Host '[EDIT AI] 3/10 empacotando runtime'
Invoke-Checked 'pack:runtimes' { npm run pack:runtimes }

if ($Mode -eq 'release') {
  Write-Host '[EDIT AI] 4/10 fixando URLs + SHA-256 no aplicativo'
  if (-not $env:EDITAI_RUNTIME_PACK_BASE_URL) { throw 'Defina EDITAI_RUNTIME_PACK_BASE_URL.' }
  if (-not $env:EDITAI_UPDATE_BASE_URL) { throw 'Defina EDITAI_UPDATE_BASE_URL.' }
  Invoke-Checked 'configure release' { node scripts/configure-editai-release.mjs }
  $env:EDITAI_BUNDLE_RUNTIMES = '0'
  Write-Host '[EDIT AI] 5/10 release gate estrito'
  Invoke-Checked 'release gate estrito' { node scripts/verify-editai-release.mjs --release }
  if ($PublishRuntime) {
    Write-Host '[EDIT AI] 6/10 publicando runtime'
    Invoke-Checked 'publish runtime' { node scripts/editai-publish-runtimes.mjs }
  } else {
    Write-Host '[EDIT AI] 6/10 runtime não publicado (-PublishRuntime no release final)'
  }
} else {
  Write-Host '[EDIT AI] 4/10 QA fat: runtime ficará dentro do app'
  $env:EDITAI_BUNDLE_RUNTIMES = '1'
  Write-Host '[EDIT AI] 5/10 distribuição remota não é necessária'
  Write-Host '[EDIT AI] 6/10 sem upload para QA'
}

Write-Host '[EDIT AI] 7/10 preparando Maker Squirrel'
Invoke-Checked 'prepare:forge-makers' { npm run prepare:forge-makers }
Write-Host '[EDIT AI] 8/11 gerando Windows x64'
Invoke-Checked 'electron-forge make' { npx --yes --package=node@22.23.2 -c "electron-forge make --platform=win32 --arch=x64" }

$SquirrelDir = Join-Path $Root 'out\make\squirrel.windows\x64'
$GeneratedSetup = Get-ChildItem -Path $SquirrelDir -File -Filter '*Setup.exe' |
  Where-Object { $_.Name -ne 'EDIT-AI-Setup.exe' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$CanonicalSetup = Join-Path $SquirrelDir 'EDIT-AI-Setup.exe'
if ($GeneratedSetup) {
  Move-Item -Path $GeneratedSetup.FullName -Destination $CanonicalSetup -Force
}
if (-not (Test-Path $CanonicalSetup -PathType Leaf)) {
  throw 'O Forge não gerou o instalador canônico EDIT-AI-Setup.exe.'
}

Write-Host '[EDIT AI] 9/12 verificando artefatos e assinatura'
if ($Mode -eq 'release' -and -not $AllowUnsignedRelease) {
  & powershell -ExecutionPolicy Bypass -File scripts/editai-inspect-windows-artifacts.ps1 -RequireSignature
} else {
  & powershell -ExecutionPolicy Bypass -File scripts/editai-inspect-windows-artifacts.ps1
}
if ($LASTEXITCODE -ne 0) { throw 'Inspeção dos artefatos Windows falhou.' }

if ($Mode -eq 'qa') {
  Write-Host '[EDIT AI] 10/12 smoke test do executável empacotado'
  & powershell -ExecutionPolicy Bypass -File scripts/editai-smoke-windows.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Smoke test do executável empacotado falhou.' }
  & powershell -ExecutionPolicy Bypass -File scripts/editai-media-smoke-windows.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Media smoke FFmpeg/FFprobe falhou.' }
} else {
  Write-Host '[EDIT AI] 10/12 smoke empacotado será executado no QA antes da promoção'
}

if ($Mode -eq 'release' -and $PublishUpdate) {
  Write-Host '[EDIT AI] 11/12 publicando Setup + canal Squirrel'
  Invoke-Checked 'publish update' { node scripts/editai-publish-update.mjs }
} else {
  Write-Host '[EDIT AI] 11/12 publicação do app ignorada'
}

Write-Host '[EDIT AI] 12/12 concluído'
Write-Host 'Artefatos: out/make/squirrel.windows/x64'
Write-Host 'Teste obrigatório: instalar o EDIT-AI-Setup.exe em uma VM Windows limpa e executar vídeo real.'
