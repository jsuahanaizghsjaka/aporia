#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$ProjectPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Aporia')
)

$ErrorActionPreference = 'Stop'
$SourceRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
$ProjectPath = [IO.Path]::GetFullPath($ProjectPath).TrimEnd('\')

# ASCII messages also work in Windows PowerShell 5.1 without an encoding change.
if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot 'package.json'))) {
  throw 'The update package is incomplete: package.json is missing.'
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath '.git'))) {
  throw "Existing Git project not found: $ProjectPath"
}
if ($SourceRoot -eq $ProjectPath) {
  throw 'Run the installer from the extracted update package, not the project scripts folder.'
}
$null = Get-Command node.exe -ErrorAction Stop
$null = Get-Command npm.cmd -ErrorAction Stop
$nodeVersion = & node.exe --version
if ($LASTEXITCODE -ne 0 -or [version]($nodeVersion -replace '^v', '') -lt [version]'22.18.0') {
  throw 'Node.js 22.18 or newer is required.'
}

# Do not terminate unrelated applications or block on every Node process.
$projectNodes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object {
    $_.CommandLine -and $_.CommandLine.IndexOf($ProjectPath + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0
  })
if ($projectNodes.Count -gt 0) {
  $processIds = ($projectNodes | ForEach-Object { $_.ProcessId }) -join ', '
  throw "Stop the Aporia dev server with Ctrl+C and retry. Project Node process IDs: $processIds"
}

$oldFiles = @(
  '.agents\skills\graphify', '.claude\skills\playwright-cli',
  'desktop-dashboard.png', 'mobile-dashboard.png', 'skills-lock.json'
)
$excludedDirs = @('.git', 'node_modules', '.next', '.aporia-update', '.aporia-backups', '.vercel', '.playwright-cli')
$sourceFiles = @(Get-ChildItem -LiteralPath $SourceRoot -Recurse -File -Force | Where-Object {
  $relative = $_.FullName.Substring($SourceRoot.Length + 1)
  $parts = $relative -split '\\'
  $blocked = @($parts | Where-Object { $_ -in $excludedDirs }).Count -gt 0
  -not $blocked -and ($_.Name -notlike '.env*' -or $_.Name -eq '.env.example')
})

# Preserve overwritten source and known obsolete files inside the same project.
# Git history and environment files stay at their original paths.
$backupFiles = @{}
foreach ($sourceFile in $sourceFiles) {
  $relative = $sourceFile.FullName.Substring($SourceRoot.Length + 1)
  $existing = Join-Path $ProjectPath $relative
  if (Test-Path -LiteralPath $existing -PathType Leaf) { $backupFiles[$relative] = $existing }
}
foreach ($oldFile in $oldFiles) {
  $existing = Join-Path $ProjectPath $oldFile
  if (Test-Path -LiteralPath $existing) {
    $items = if (Test-Path -LiteralPath $existing -PathType Leaf) { Get-Item -LiteralPath $existing } else {
      Get-ChildItem -LiteralPath $existing -Recurse -File -Force
    }
    foreach ($item in $items) {
      if ($item.Name -like '.env*' -or $item.Extension -eq '.pem') { continue }
      $relative = $item.FullName.Substring($ProjectPath.Length + 1)
      $backupFiles[$relative] = $item.FullName
    }
  }
}
$backupDirectory = Join-Path $ProjectPath '.aporia-backups'
$null = New-Item -ItemType Directory -Path $backupDirectory -Force
$backupPath = Join-Path $backupDirectory (('before-update-{0}-{1}.zip' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), [guid]::NewGuid().ToString('N').Substring(0, 8)))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$backup = [IO.Compression.ZipFile]::Open($backupPath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($entry in $backupFiles.GetEnumerator()) {
    $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($backup, $entry.Value, $entry.Key.Replace('\', '/'))
  }
} finally { $backup.Dispose() }
Write-Host "Backup of replaced files: $backupPath"

Write-Host "Updating: $ProjectPath"
# Copy only package files; no mirror/delete operation on the whole project.
foreach ($sourceFile in $sourceFiles) {
  $relative = $sourceFile.FullName.Substring($SourceRoot.Length + 1)
  $destination = Join-Path $ProjectPath $relative
  $null = New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force
  Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force
}
foreach ($oldFile in $oldFiles) {
  $path = Join-Path $ProjectPath $oldFile
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
foreach ($directory in @('node_modules', '.next')) {
  $path = Join-Path $ProjectPath $directory
  try {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
  } catch {
    throw "Cannot remove $directory. Stop Aporia, pause OneDrive, close file viewers, then retry. $($_.Exception.Message)"
  }
}

Push-Location -LiteralPath $ProjectPath
try {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE). Verification was not started." }
  & npm.cmd run verify
  if ($LASTEXITCODE -ne 0) { throw "npm run verify failed (exit $LASTEXITCODE). Update is not verified." }
} finally { Pop-Location }

Write-Host ''
Write-Host 'UPDATE VERIFIED. Run npm run dev in the Desktop Aporia folder.'
Write-Host 'Open http://localhost:3000/preview (or the port shown by Next.js).'
Write-Host 'No commit, push, or deployment was performed.'
