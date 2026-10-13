#requires -Version 7.0
param([string]$WorkspacePath, [string]$ForgeHome)
$ErrorActionPreference = 'Stop'
$forgePortable = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $WorkspacePath) { $WorkspacePath = Join-Path $forgePortable 'Forge-Operations' }
if (-not $ForgeHome) { $ForgeHome = Join-Path $forgePortable 'ForgeData/home' }
$env:FORGE_PORTABLE_ROOT = $forgePortable
& (Join-Path $forgePortable 'resources/runtime/primary-runtime/dependencies/node/bin/node.exe') (Join-Path $PSScriptRoot 'Connect-Filesystem-Mcp.mjs') $ForgeHome $WorkspacePath
if ($LASTEXITCODE -ne 0) { throw "MCP 配置失败，退出码 $LASTEXITCODE。" }
