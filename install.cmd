@echo off
REM KubeNinja setup — double-click this, or run: install.cmd
REM It runs install.ps1 with the execution policy bypassed for this one process.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
