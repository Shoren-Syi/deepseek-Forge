#requires -Version 7.0
param(
    [string]$PortableDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Forge-Windows-P10'),
    [Parameter(Mandatory)][string]$CertificateFile,
    [Parameter(Mandatory)][securestring]$CertificatePassword,
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PortableDirectory)) { throw "便携目录不存在：$PortableDirectory" }
if (-not (Test-Path -LiteralPath $CertificateFile)) { throw "证书文件不存在：$CertificateFile" }
$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if ($null -eq $signtool) { throw '未找到 signtool.exe，请安装 Windows SDK 后再执行。' }

$password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($CertificatePassword)
)
try {
    $targets = Get-ChildItem -LiteralPath $PortableDirectory -Recurse -File |
        Where-Object Extension -in '.exe', '.dll'
    if ($targets.Count -eq 0) { throw "便携目录中没有可签名的 EXE/DLL：$PortableDirectory" }
    foreach ($target in $targets) {
        & $signtool.Source sign /fd SHA256 /f $CertificateFile /p $password /tr $TimestampUrl /td SHA256 $target.FullName
        if ($LASTEXITCODE -ne 0) { throw "签名失败：$($target.FullName)" }
    }
    Write-Output "已签名 $($targets.Count) 个文件：$PortableDirectory"
}
finally {
    $password = $null
}
