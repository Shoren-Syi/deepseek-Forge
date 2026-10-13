@echo off
"%~dp0resources\forge\pwsh\pwsh.exe" -NoProfile -File "%~dp0resources\forge\Connect-Portable-Mcp.ps1" %*
exit /b %errorlevel%
