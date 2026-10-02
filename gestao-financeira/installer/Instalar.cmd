@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-GestaoFinanceira.ps1"
exit /b %ERRORLEVEL%
