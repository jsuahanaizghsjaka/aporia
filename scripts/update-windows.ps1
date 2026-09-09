[CmdletBinding()]
param(
  [string]$ProjectPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Aporia')
)

$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$ProjectPath = [IO.Path]::GetFullPath($ProjectPath)

if (-not (Test-Path (Join-Path $SourceRoot 'package.json'))) {
  throw "Запусти этот скрипт из распакованной папки Aporia."
}
if (-not (Test-Path (Join-Path $ProjectPath '.git'))) {
  throw "Не найден Git-проект: $ProjectPath. Проверь путь и повтори."
}
if ((Get-Process node -ErrorAction SilentlyContinue).Count -gt 0) {
  throw "Останови npm run dev через Ctrl+C и закрой другие Node-процессы, затем повтори."
}

Write-Host "Обновляем: $ProjectPath"
$copy = Start-Process robocopy -ArgumentList @(
  "`"$SourceRoot`"", "`"$ProjectPath`"", '/E', '/COPY:DAT', '/DCOPY:DAT',
  '/R:1', '/W:1', '/XD', '.git', 'node_modules', '.next', '/XF', '.env.local'
) -Wait -PassThru -NoNewWindow
if ($copy.ExitCode -gt 7) { throw "Не удалось скопировать исходники (Robocopy: $($copy.ExitCode))." }

# Files from the earlier agent/tool setup that no longer belong in Aporia.
@('.agents', '.claude', 'desktop-dashboard.png', 'mobile-dashboard.png', 'skills-lock.json') |
  ForEach-Object {
    $path = Join-Path $ProjectPath $_
    if (Test-Path $path) { Remove-Item $path -Recurse -Force }
  }

# Generated files are deliberately rebuilt. Git history and local secrets remain untouched.
@('node_modules', '.next') | ForEach-Object {
  $path = Join-Path $ProjectPath $_
  if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}

Push-Location $ProjectPath
try {
  npm ci
  npm run verify
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Готово. Открой VS Code в той же папке и выполни: npm run dev'
Write-Host 'Коммит и push этот скрипт не выполняет.'
