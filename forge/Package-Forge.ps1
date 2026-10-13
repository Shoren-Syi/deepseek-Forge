#requires -Version 7.0
. (Join-Path $PSScriptRoot 'Environment.ps1')
$env:DSH_DESKTOP_TARGET_PLATFORM = 'win32'
$env:DSH_DESKTOP_TARGET_ARCH = 'x64'
$env:DSH_DESKTOP_APP_ID = 'ai.deepseek.forge'
$env:DSH_DESKTOP_UNSIGNED = '1'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
$packageRoot = [IO.Path]::GetFullPath((Join-Path $forgeRepository 'apps/desktop/.forge-package-build'))
if (-not $packageRoot.StartsWith([IO.Path]::GetFullPath($forgeRepository) + [IO.Path]::DirectorySeparatorChar)) { throw '打包目录必须位于 Forge 副本内部。' }
$env:DSH_DESKTOP_BUILD_ROOT = $packageRoot
$packed = Join-Path $packageRoot 'targets/win-x64/packed'
$env:FORGE_PWSH_DIRECTORY = Split-Path -Parent (Get-Command pwsh -CommandType Application | Select-Object -First 1).Source
Push-Location $forgeRepository
try {
    $mcpSource = Join-Path $forgeLocal 'mcp-portable'
    New-Item -ItemType Directory -Path $mcpSource -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'mcp-filesystem/package.json') -Destination $mcpSource
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'mcp-filesystem/package-lock.json') -Destination $mcpSource
    & npm ci --prefix $mcpSource --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '本地 MCP 便携依赖安装失败。' }
    & (Join-Path $PSScriptRoot 'Build-Forge.ps1')
    & node (Join-Path $PSScriptRoot 'pack-workspaces.mjs') $packed
    if ($LASTEXITCODE -ne 0) { throw 'Forge 运行包打包失败。' }
    Invoke-ForgePnpm --filter '@deepseek-ai/dsh-desktop' run prepare:runtime
    Invoke-ForgePnpm --filter '@deepseek-ai/dsh-desktop' run prepare:packages
    Invoke-ForgePnpm --filter '@deepseek-ai/dsh-desktop' run prepare:dsh
    Invoke-ForgePnpm --dir 'apps/desktop' exec electron-builder --config 'scripts/forge-builder-config.mjs' --win --x64 --dir --publish never
    $portableOutput = Join-Path $packageRoot 'targets/win-x64/unsigned-artifacts/win-unpacked'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Connect-Local-Mcp.cmd') -Destination $portableOutput
    & node --input-type=module -e 'import { cp } from "node:fs/promises"; await cp(process.argv[1], process.argv[2], {recursive:true, dereference:true});' $mcpSource (Join-Path $portableOutput 'resources/forge/mcp')
    if ($LASTEXITCODE -ne 0) { throw '本地 MCP 服务复制失败。' }
    Write-Output "Forge 便携应用已生成：$packageRoot/targets/win-x64/unsigned-artifacts/win-unpacked"
} finally {
    Pop-Location
}
