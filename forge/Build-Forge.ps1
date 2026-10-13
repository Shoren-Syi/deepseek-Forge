#requires -Version 7.0
param([switch]$Install)
. (Join-Path $PSScriptRoot 'Environment.ps1')
Push-Location $forgeRepository
try {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cordis.patch.yml') -Destination 'packages/bundle/web-app/forge.patch.yml'
    if ($Install) {
        if (-not (Test-Path -LiteralPath $forgePnpm)) {
            & npm install --prefix (Join-Path $forgeLocal 'tools/pnpm') pnpm@11.28.5 --ignore-scripts --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw '独立 pnpm 安装失败。' }
        }
        Invoke-ForgePnpm install --frozen-lockfile --config.confirmModulesPurge=false
    }
    Invoke-ForgePnpm run build --artifacts-only
    Invoke-ForgePnpm --filter '@deepseek-ai/dsh-desktop' run build
} finally {
    Pop-Location
}
