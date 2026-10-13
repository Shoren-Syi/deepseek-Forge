#requires -Version 7.0
param(
    [ValidateSet('Desktop', 'Web')][string]$Mode = 'Desktop',
    [string]$WorkspaceRoot = (Join-Path $PSScriptRoot 'workspace'),
    [int]$Port = 3188,
    [switch]$NoOpen
)
$forgeSourceRoot = Split-Path -Parent $PSScriptRoot
$forgePortableDirectory = Join-Path (Split-Path -Parent $forgeSourceRoot) 'Forge-Windows-P10'
$forgePortableExecutable = Join-Path $forgePortableDirectory 'DeepSeek Forge.exe'
if ($Mode -eq 'Desktop' -and (Test-Path -LiteralPath $forgePortableExecutable)) {
    # 便携入口在开发环境初始化之前启动，两种桌面入口共用同一份配置和会话。
    $forgeLaunchEnvironment = @{
        FORGE_DATA_ROOT = Join-Path $forgePortableDirectory 'ForgeData'
        FORGE_WORKSPACE_ROOT = $null
    }
    if ($PSBoundParameters.ContainsKey('WorkspaceRoot')) {
        $forgeRequestedWorkspace = [IO.Path]::GetFullPath($WorkspaceRoot)
        if (-not $forgeRequestedWorkspace.StartsWith('D:', [StringComparison]::OrdinalIgnoreCase)) { throw '新工作区必须位于 D 盘。' }
        New-Item -ItemType Directory -Path $forgeRequestedWorkspace -Force | Out-Null
        $forgeLaunchEnvironment.FORGE_WORKSPACE_ROOT = $forgeRequestedWorkspace
    }
    Start-Process -FilePath $forgePortableExecutable -WorkingDirectory $forgePortableDirectory -WindowStyle Hidden -Environment $forgeLaunchEnvironment
    return
}
. (Join-Path $PSScriptRoot 'Environment.ps1')
New-Item -ItemType Directory -Path $WorkspaceRoot -Force | Out-Null
$env:FORGE_WORKSPACE_ROOT = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
& node (Join-Path $PSScriptRoot 'profile.mjs') $env:DSH_HOME
if ($LASTEXITCODE -ne 0) { throw 'Forge 配置升级失败。' }

if ($Mode -eq 'Desktop') {
    $profileDirectory = Join-Path $env:DSH_HOME 'profiles/desktop'
    New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
    Push-Location $forgeRepository
    try {
        Invoke-ForgePnpm run start:desktop
    } finally {
        Pop-Location
    }
} else {
    Push-Location $env:FORGE_WORKSPACE_ROOT
    try {
        $cli = Join-Path $forgeRepository 'apps/cli/lib/bin.js'
        $arguments = @($cli, '--profile', 'forge')
        $profileManifest = Join-Path $env:DSH_HOME 'profiles/forge/package.json'
        if (-not (Test-Path -LiteralPath $profileManifest)) { $arguments += @('--from-default-profile', 'web') }
        $arguments += @('--port', "$Port")
        if ($NoOpen) { $arguments += '--no-open' }
        & node @arguments
        if ($LASTEXITCODE -ne 0) { throw "Forge 启动失败，退出码 $LASTEXITCODE。" }
    } finally {
        Pop-Location
    }
}
