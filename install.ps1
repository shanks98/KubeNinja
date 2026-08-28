# KubeNinja setup - installs prerequisites, skipping anything already present.
# Run:  powershell -ExecutionPolicy Bypass -File install.ps1     (or double-click install.cmd)
#
# Steps: Node.js 20+ (via winget) - npm dependencies - bundled helm binary.
[CmdletBinding()]
param([switch]$SkipHelm)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root
$HELM_VERSION = 'v3.16.4'

function Info($m)  { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m)    { Write-Host "OK  $m" -ForegroundColor Green }
function Step($m)  { Write-Host "`n== $m ==" -ForegroundColor Cyan }
function Warn($m)  { Write-Host "!!  $m" -ForegroundColor Yellow }
function Have($c)  { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path','User')
}

Write-Host "KubeNinja setup" -ForegroundColor White
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  Warn "Run this from the KubeNinja folder (no package.json here)."; exit 1
}

# 1. Node.js 20+
Step "Node.js (>= 20)"
$needNode = $true
if (Have node) {
  $ver = (node -v).TrimStart('v')
  if ([int]($ver.Split('.')[0]) -ge 20) { Ok "Node $ver already installed"; $needNode = $false }
  else { Warn "Node $ver is older than 20 - upgrading" }
} else { Info "Node.js not found" }

if ($needNode) {
  if (Have winget) {
    Info "Installing Node.js LTS via winget (a UAC prompt may appear)..."
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    RefreshPath
    if (Have node) { Ok "Node $(node -v) installed" }
    else { Warn "Node installed but not on this shell's PATH. Close this window, open a NEW one, and re-run install."; exit 1 }
  } else {
    Warn "winget is unavailable. Install Node.js LTS (20+) from https://nodejs.org, reopen the terminal, and re-run."; exit 1
  }
}

# 2. npm dependencies
Step "npm dependencies"
# Invoke through cmd so PowerShell's script-execution policy never blocks npm.
Info "Running npm install (this can take a couple of minutes)..."
cmd /c "npm install"
if ($LASTEXITCODE -ne 0) { Warn "npm install failed (see output above)."; exit 1 }
Ok "Dependencies installed"

# 3. Bundled helm binary (for the Helm view)
if (-not $SkipHelm) {
  Step "Helm binary"
  $helm = Join-Path $root 'resources\bin\helm-win-x64.exe'
  if (Test-Path $helm) { Ok "helm already present" }
  else {
    try {
      New-Item -ItemType Directory -Force (Split-Path $helm) | Out-Null
      $zip = Join-Path $env:TEMP 'kn-helm.zip'
      $tmp = Join-Path $env:TEMP 'kn-helm'
      Info "Downloading helm $HELM_VERSION..."
      Invoke-WebRequest "https://get.helm.sh/helm-$HELM_VERSION-windows-amd64.zip" -OutFile $zip -UseBasicParsing
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
      Expand-Archive $zip -DestinationPath $tmp -Force
      Copy-Item (Join-Path $tmp 'windows-amd64\helm.exe') $helm -Force
      Remove-Item $zip, $tmp -Recurse -Force
      Ok "helm bundled ($helm)"
    } catch { Warn "Could not fetch helm ($($_.Exception.Message)). Helm actions will be disabled; the rest works." }
  }
}

# Done
Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host "Next:" -ForegroundColor White
Write-Host "  npm run dev            " -NoNewline -ForegroundColor Cyan; Write-Host "# launch with hot reload"
Write-Host "  npm run pack:portable  " -NoNewline -ForegroundColor Cyan; Write-Host "# build dist\KubeNinja-win-x64\KubeNinja.exe, then run KubeNinja.exe"
