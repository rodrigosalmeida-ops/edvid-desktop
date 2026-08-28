param(
  [string]$SmokeReportPath,
  [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $SmokeReportPath) { $SmokeReportPath = Join-Path $Root 'out\editai-smoke.json' }
$SmokeReportPath = [System.IO.Path]::GetFullPath($SmokeReportPath)
if (-not $OutputPath) { $OutputPath = Join-Path $Root 'out\editai-media-smoke.json' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

$ffmpeg = $null
$ffprobe = $null
if (Test-Path $SmokeReportPath -PathType Leaf) {
  $runtimeReport = Get-Content -Raw $SmokeReportPath | ConvertFrom-Json
  $ffmpegEntry = @($runtimeReport.runtimes | Where-Object { $_.name -eq 'ffmpeg' }) | Select-Object -First 1
  $ffprobeEntry = @($runtimeReport.runtimes | Where-Object { $_.name -eq 'ffprobe' }) | Select-Object -First 1
  if ($ffmpegEntry -and $ffmpegEntry.available -and $ffmpegEntry.executablePath -and
      $ffprobeEntry -and $ffprobeEntry.available -and $ffprobeEntry.executablePath) {
    $ffmpeg = [string]$ffmpegEntry.executablePath
    $ffprobe = [string]$ffprobeEntry.executablePath
  } else {
    Write-Host '[EDIT AI] smoke report sem runtimes utilizaveis; usando FFmpeg/FFprobe staged.'
  }
}

if (-not $ffmpeg -or -not $ffprobe) {
  # O smoke BootOnly pode criar editai-smoke.json sem inventariar runtimes.
  # Nesse caso (ou antes de existir relatorio), valide diretamente o runtime staged.
  $runtimeRoot = Join-Path $Root 'resources\runtimes\win32-x64'
  $ffmpegItem = Get-ChildItem -Path $runtimeRoot -Filter 'ffmpeg.exe' -File -Recurse -ErrorAction Stop | Select-Object -First 1
  if (-not $ffmpegItem) { throw "FFmpeg staged nao encontrado em $runtimeRoot." }
  $ffprobeItem = Get-ChildItem -Path $ffmpegItem.DirectoryName -Filter 'ffprobe.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $ffprobeItem) {
    $ffprobeItem = Get-ChildItem -Path $runtimeRoot -Filter 'ffprobe.exe' -File -Recurse -ErrorAction Stop | Select-Object -First 1
  }
  if (-not $ffprobeItem) { throw "FFprobe staged nao encontrado em $runtimeRoot." }
  $ffmpeg = $ffmpegItem.FullName
  $ffprobe = $ffprobeItem.FullName
  if (-not (Test-Path $SmokeReportPath -PathType Leaf)) {
    Write-Host '[EDIT AI] smoke report ainda nao existe; usando FFmpeg/FFprobe staged.'
  }
}

$work = Join-Path $Root 'out\editai-media-smoke'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$source = Join-Path $work 'vertical-source.mp4'
$transcoded = Join-Path $work 'vertical-transcoded.mp4'
Remove-Item $source,$transcoded -Force -ErrorAction SilentlyContinue

& $ffmpeg -hide_banner -loglevel error -y `
  -f lavfi -i 'color=c=black:s=360x640:r=30:d=1.2' `
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=1.2' `
  -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p `
  -c:a aac -b:a 96k -shortest -movflags +faststart $source
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $source)) { throw 'FFmpeg falhou ao gerar midia sintetica H.264/AAC.' }

& $ffmpeg -hide_banner -loglevel error -y -i $source `
  -vf 'scale=540:960' -c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p `
  -c:a aac -b:a 96k -movflags +faststart $transcoded
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $transcoded)) { throw 'FFmpeg falhou no transcode vertical.' }

$probeRaw = & $ffprobe -v error -show_streams -show_format -of json $transcoded
if ($LASTEXITCODE -ne 0) { throw 'FFprobe falhou ao ler o arquivo gerado.' }
$probe = ($probeRaw -join "`n") | ConvertFrom-Json
$video = @($probe.streams | Where-Object { $_.codec_type -eq 'video' }) | Select-Object -First 1
$audio = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' }) | Select-Object -First 1
if (-not $video) { throw 'Stream de video ausente.' }
if (-not $audio) { throw 'Stream de audio ausente.' }
if ([int]$video.width -ne 540 -or [int]$video.height -ne 960) { throw "Dimensao inesperada: $($video.width)x$($video.height)" }
if ([string]$video.codec_name -ne 'h264') { throw "Codec de video inesperado: $($video.codec_name)" }
if ([string]$audio.codec_name -ne 'aac') { throw "Codec de audio inesperado: $($audio.codec_name)" }

$hash = Get-FileHash -Algorithm SHA256 -Path $transcoded
$result = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  ok = $true
  ffmpeg = $ffmpeg
  ffprobe = $ffprobe
  output = $transcoded
  bytes = (Get-Item $transcoded).Length
  sha256 = $hash.Hash.ToLowerInvariant()
  video = [ordered]@{ codec = [string]$video.codec_name; width = [int]$video.width; height = [int]$video.height }
  audio = [ordered]@{ codec = [string]$audio.codec_name; sampleRate = [string]$audio.sample_rate }
}
New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath -Parent) | Out-Null
$result | ConvertTo-Json -Depth 6 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Host '[EDIT AI] media smoke PASS - H.264/AAC 540x960.'
Write-Host "[EDIT AI] relatorio: $OutputPath"
