param(
  [string]$ExecutablePath,
  [string]$InstallReportPath,
  [string]$RuntimeSmokePath,
  [int]$TimeoutSeconds = 10800
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $InstallReportPath) { $InstallReportPath = Join-Path $Root 'out\editai-install-smoke.json' }
if (-not $RuntimeSmokePath) { $RuntimeSmokePath = Join-Path $Root 'out\editai-installed-smoke.json' }
$InstallReportPath = (Resolve-Path $InstallReportPath).Path
$RuntimeSmokePath = (Resolve-Path $RuntimeSmokePath).Path

$install = Get-Content -Raw $InstallReportPath | ConvertFrom-Json
if (-not $ExecutablePath) { $ExecutablePath = [string]$install.executable }
$ExecutablePath = (Resolve-Path $ExecutablePath).Path
$runtime = Get-Content -Raw $RuntimeSmokePath | ConvertFrom-Json

function Runtime-Path {
  param([string]$Name)
  $item = @($runtime.runtimes | Where-Object { $_.name -eq $Name -and $_.available }) | Select-Object -First 1
  if (-not $item -or -not $item.executablePath) { throw "Runtime ausente para E2E: $Name" }
  return [string]$item.executablePath
}

$ffmpeg = Runtime-Path 'ffmpeg'
$ffprobe = Runtime-Path 'ffprobe'
$uv = Runtime-Path 'uv'
$work = Join-Path $Root 'out\editai-e2e-real'
$project = Join-Path $Root 'out\editai-e2e-project'
$speech = Join-Path $work 'fala-tiktok-shop.mp3'
$inputVideo = Join-Path $work 'editai-e2e-input.mp4'
$reportPath = Join-Path $Root 'out\editai-e2e-real-report.json'
New-Item -ItemType Directory -Force -Path $work | Out-Null
if (Test-Path $project) {
  $existing = @(Get-ChildItem -Force $project -ErrorAction SilentlyContinue)
  if ($existing.Count -gt 0) { throw 'A pasta do projeto E2E precisa estar vazia.' }
} else {
  New-Item -ItemType Directory -Path $project | Out-Null
}
Remove-Item $speech,$inputVideo,$reportPath -Force -ErrorAction SilentlyContinue

# Fixture de QA gerada durante o job; nao e distribuida com o aplicativo.
# O texto contem evidencias literais de hook, beneficio, prova, preco e CTA.
$speechText = 'Pare agora e olha esse organizador portatil. Ele ajuda a organizar seus produtos e economiza espaco. Eu testei e o resultado apareceu no mesmo dia. Hoje custa trinta e nove reais e noventa centavos. Clique no carrinho e garanta o seu agora.'
Write-Host '[EDIT AI E2E] gerando fala pt-BR para o MP4 de entrada...'
$ttsArgs = @(
  'tool', 'run', '--from', 'edge-tts==7.2.8', 'edge-tts',
  '--voice', 'pt-BR-FranciscaNeural', '--rate=+8%',
  '--text', $speechText, '--write-media', $speech
)
& $uv @ttsArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $speech)) { throw 'Falha ao gerar fala pt-BR da fixture E2E.' }

Write-Host '[EDIT AI E2E] gerando MP4 vertical H.264/AAC com fala real...'
$ffmpegArgs = @(
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'color=c=0x111318:s=540x960:r=30',
  '-i', $speech,
  '-vf', 'drawbox=x=54:y=120:w=432:h=720:color=0xFF6B2C@0.18:t=fill,drawbox=x=90:y=220:w=360:h=520:color=white@0.08:t=fill',
  '-af', 'adelay=700|700,apad=pad_dur=0.8',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '27', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', $inputVideo
)
& $ffmpeg @ffmpegArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $inputVideo)) { throw 'Falha ao gerar o MP4 falado da fixture E2E.' }

$inputProbeRaw = & $ffprobe -v error -show_streams -show_format -of json $inputVideo
if ($LASTEXITCODE -ne 0) { throw 'FFprobe nao conseguiu validar o MP4 de entrada E2E.' }
$inputProbe = ($inputProbeRaw -join [Environment]::NewLine) | ConvertFrom-Json
if (-not (@($inputProbe.streams | Where-Object { $_.codec_type -eq 'video' }) | Select-Object -First 1)) { throw 'Entrada E2E sem video.' }
if (-not (@($inputProbe.streams | Where-Object { $_.codec_type -eq 'audio' }) | Select-Object -First 1)) { throw 'Entrada E2E sem audio.' }

$arguments = @(
  '--editai-e2e',
  "--editai-e2e-input=$inputVideo",
  "--editai-e2e-output=$reportPath",
  "--editai-e2e-project=$project"
)
Write-Host "[EDIT AI E2E] executando no aplicativo instalado: $ExecutablePath"
$process = Start-Process -FilePath $ExecutablePath -ArgumentList $arguments -PassThru
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
  try { $process.Kill() } catch {}
  throw "E2E real excedeu $TimeoutSeconds s."
}
if ($process.ExitCode -ne 0) {
  $detail = if (Test-Path $reportPath) { (Get-Content -Raw $reportPath) } else { 'sem relatorio' }
  throw "E2E real falhou (exit $($process.ExitCode)): $detail"
}
if (-not (Test-Path $reportPath)) { throw 'O aplicativo nao gerou o relatorio E2E.' }
$report = Get-Content -Raw $reportPath | ConvertFrom-Json
if (-not $report.ok) { throw "Relatorio E2E marcou ok=false: $($report.error)" }

$export = (Resolve-Path ([string]$report.renderedVideo)).Path
$preview = (Resolve-Path ([string]$report.previewImage)).Path
$exportCopy = Join-Path $work 'EDIT-AI-E2E-export.mp4'
$previewCopy = Join-Path $work 'EDIT-AI-E2E-preview.png'
Copy-Item -Force $export $exportCopy
Copy-Item -Force $preview $previewCopy
$evidenceFiles = [ordered]@{
  'EDIT-AI-E2E-transcript.json' = (Join-Path $project 'edit\transcricao_raw\entrada.json')
  'EDIT-AI-E2E-edl.json' = (Join-Path $project 'edit\edl.json')
  'EDIT-AI-E2E-timeline.json' = (Join-Path $project 'edit\timeline.json')
  'EDIT-AI-E2E-edit-data.json' = (Join-Path $project 'edit\remotion\public\edit-data.json')
  'EDIT-AI-E2E-captions.json' = (Join-Path $project 'edit\remotion\public\captions.json')
}
foreach ($entry in $evidenceFiles.GetEnumerator()) {
  if (-not (Test-Path $entry.Value)) { throw "Evidencia E2E ausente: $($entry.Value)" }
  Copy-Item -Force $entry.Value (Join-Path $work $entry.Key)
}

$probeRaw = & $ffprobe -v error -show_streams -show_format -of json $exportCopy
if ($LASTEXITCODE -ne 0) { throw 'FFprobe nao conseguiu validar o export E2E.' }
$probe = ($probeRaw -join [Environment]::NewLine) | ConvertFrom-Json
$video = @($probe.streams | Where-Object { $_.codec_type -eq 'video' }) | Select-Object -First 1
$audio = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' }) | Select-Object -First 1
if (-not $video -or [string]$video.codec_name -ne 'h264') { throw 'Export E2E sem video H.264.' }
if (-not $audio -or [string]$audio.codec_name -ne 'aac') { throw 'Export E2E sem audio AAC.' }
if ([int]$video.width -ne 1080 -or [int]$video.height -ne 1920) { throw "Export E2E fora de 9:16: $($video.width)x$($video.height)" }

$summary = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  ok = $true
  executable = $ExecutablePath
  input = [ordered]@{
    file = $inputVideo
    bytes = (Get-Item $inputVideo).Length
    sha256 = (Get-FileHash $inputVideo -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  report = $reportPath
  preview = [ordered]@{
    file = $previewCopy
    bytes = (Get-Item $previewCopy).Length
    sha256 = (Get-FileHash $previewCopy -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  export = [ordered]@{
    file = $exportCopy
    bytes = (Get-Item $exportCopy).Length
    sha256 = (Get-FileHash $exportCopy -Algorithm SHA256).Hash.ToLowerInvariant()
    codec = [string]$video.codec_name
    audioCodec = [string]$audio.codec_name
    width = [int]$video.width
    height = [int]$video.height
    duration = [double]$probe.format.duration
  }
}
$summaryPath = Join-Path $Root 'out\editai-e2e-real-summary.json'
$summary | ConvertTo-Json -Depth 7 | Set-Content -Path $summaryPath -Encoding UTF8
Write-Host '[EDIT AI E2E] PASS - import -> WhisperX -> timeline -> TikTok Shop A/B -> Brand Kit -> preview -> Remotion -> MP4.'
Write-Host "[EDIT AI E2E] relatorio: $reportPath"
Write-Host "[EDIT AI E2E] resumo: $summaryPath"
