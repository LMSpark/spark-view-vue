@echo off
setlocal
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
echo Restoring Claude Code Bailian Token Plan setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%restore-claude-bailian.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if /I not "%~1"=="-NoPause" (
  echo.
  pause
)

exit /b %EXIT_CODE%
