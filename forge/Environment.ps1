#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$forgeRepository = Split-Path -Parent $PSScriptRoot
$forgeLocal = Join-Path $PSScriptRoot '.local'
foreach ($directory in @('tmp', 'cache', 'data', 'home', 'electron', 'npm-cache', 'pnpm-store', 'tools', 'electron-cache', 'electron-builder-cache')) {
    New-Item -ItemType Directory -Path (Join-Path $forgeLocal $directory) -Force | Out-Null
}

$env:DSH_HOME = Join-Path $forgeLocal 'home'
$env:FORGE_WORKSPACE_ROOT = Join-Path $PSScriptRoot 'workspace'
$env:FORGE_DESKTOP = '1'
$env:FORGE_DATA_ROOT = $forgeLocal
$env:FORGE_NODE = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$env:FORGE_PWSH_PATH = (Get-Command pwsh -CommandType Application | Select-Object -First 1).Source
$env:FORGE_PRIMARY_RUNTIME = Join-Path $forgeRepository 'apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime'
if (-not (Test-Path -LiteralPath (Join-Path $env:FORGE_PRIMARY_RUNTIME 'runtime.json'))) {
    $env:FORGE_PRIMARY_RUNTIME = Join-Path $forgeRepository 'apps/desktop/.forge-package-build/targets/win-x64/runtime/primary-runtime'
}
if (-not $env:FORGE_BROWSER_PATH) { $env:FORGE_BROWSER_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }
$env:DSH_DESKTOP_USER_DATA_DIR = Join-Path $forgeLocal 'electron'
$env:TEMP = Join-Path $forgeLocal 'tmp'
$env:TMP = $env:TEMP
$env:XDG_CACHE_HOME = Join-Path $forgeLocal 'cache'
$env:XDG_DATA_HOME = Join-Path $forgeLocal 'data'
$env:npm_config_cache = Join-Path $forgeLocal 'npm-cache'
$env:npm_config_store_dir = Join-Path $forgeLocal 'pnpm-store'
$env:PNPM_HOME = Join-Path $forgeLocal 'tools'
$env:ELECTRON_CACHE = Join-Path $forgeLocal 'electron-cache'
$env:ELECTRON_BUILDER_CACHE = Join-Path $forgeLocal 'electron-builder-cache'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $forgeLocal 'browsers'
$env:COREPACK_HOME = Join-Path $forgeLocal 'corepack'
$env:DSH_TELEMETRY_DISABLED = '1'
$env:DSH_CLIENT_TITLE = 'DeepSeek Forge'
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
$env:DSH_DESKTOP_MAIN_INSPECT_PORT = '19429'
$env:DSH_DESKTOP_RENDERER_DEBUG_PORT = '19422'
$env:DSH_DESKTOP_HOST_INSPECT_PORT = '19430'
$env:LEFTHOOK = '0'

$forgePnpm = Join-Path $forgeLocal 'tools/pnpm/node_modules/pnpm/bin/pnpm.cjs'
$env:FORGE_PNPM_CLI = $forgePnpm

function Invoke-ForgePnpm {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    & node $forgePnpm @Arguments
    if ($LASTEXITCODE -ne 0) { throw "pnpm 执行失败，退出码 $LASTEXITCODE。" }
}
