#requires -Version 7.0
param(
    [string]$ForgeHome,
    [string]$WorkspacePath,
    [switch]$Install
)
. (Join-Path $PSScriptRoot 'Environment.ps1')
$outputs = Split-Path -Parent $forgeRepository
$service = Join-Path $outputs 'Forge-MCP'
if (-not $ForgeHome) { $ForgeHome = $env:DSH_HOME }
if (-not $WorkspacePath) { $WorkspacePath = Join-Path $outputs 'Forge-Operations' }
if ($Install) {
    New-Item -ItemType Directory -Path $service -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'mcp-filesystem/package.json') -Destination (Join-Path $service 'package.json')
    Invoke-ForgePnpm --dir $service install --config.manage-package-manager-versions=false --store-dir $env:npm_config_store_dir
}
& node (Join-Path $PSScriptRoot 'Connect-Filesystem-Mcp.mjs') $ForgeHome $WorkspacePath
if ($LASTEXITCODE -ne 0) { throw '本地 MCP 连接配置失败。' }
