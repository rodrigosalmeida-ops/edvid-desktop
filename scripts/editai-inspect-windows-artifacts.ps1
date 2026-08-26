param(
  [switch]$RequireSignature
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Dir = Join-Path $Root 'out\make\squirrel.windows\x64'
if (-not (Test-Path $Dir)) { throw "Artefatos Squirrel ausentes: $Dir" }

$SetupPath = Join-Path $Dir 'EDIT-AI-Setup.exe'
$Setup = if (Test-Path $SetupPath -PathType Leaf) { Get-Item $SetupPath } else { $null }
$Releases = Join-Path $Dir 'RELEASES'
$Nupkgs = @(Get-ChildItem -Path $Dir -File -Filter '*.nupkg')
if (-not $Setup) { throw 'EDIT-AI-Setup.exe do Squirrel não encontrado.' }
if (-not (Test-Path $Releases)) { throw 'Arquivo RELEASES não encontrado.' }
if ($Nupkgs.Count -lt 1) { throw 'Nenhum .nupkg encontrado.' }

$Signature = Get-AuthenticodeSignature -FilePath $Setup.FullName
if ($RequireSignature -and $Signature.Status -ne 'Valid') {
  throw "Assinatura do Setup inválida/ausente: $($Signature.Status)"
}

function File-Info([System.IO.FileInfo]$File) {
  $Hash = Get-FileHash -Algorithm SHA256 -Path $File.FullName
  return [ordered]@{
    name = $File.Name
    bytes = $File.Length
    sha256 = $Hash.Hash.ToLowerInvariant()
  }
}

$Result = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  platform = 'win32-x64'
  setup = File-Info $Setup
  setupSignature = [ordered]@{
    status = [string]$Signature.Status
    subject = if ($Signature.SignerCertificate) { $Signature.SignerCertificate.Subject } else { $null }
    thumbprint = if ($Signature.SignerCertificate) { $Signature.SignerCertificate.Thumbprint } else { $null }
  }
  releases = File-Info (Get-Item $Releases)
  packages = @($Nupkgs | ForEach-Object { File-Info $_ })
}

$Out = Join-Path $Root 'out\editai-windows-artifacts.json'
$Result | ConvertTo-Json -Depth 6 | Set-Content -Path $Out -Encoding UTF8
Write-Host "[EDIT AI] artefatos verificados: $Out"
Write-Host "[EDIT AI] Setup: $($Setup.Name) | assinatura: $($Signature.Status)"
if ($RequireSignature) { Write-Host '[EDIT AI] gate de assinatura: PASS' }
