@echo off
cd /d d:\SPARK_VIEW\packages\spark-utils
echo Cleaning...
rd /s /q dist 2>nul
del /q *.tsbuildinfo 2>nul
echo Building...
call npx tsc -p tsconfig.build.json --force
if %ERRORLEVEL% EQU 0 (
    echo Build SUCCESS
    findstr /C:"executeEndpoint" dist\Request.js >nul
    if %ERRORLEVEL% EQU 0 (
        echo executeEndpoint FOUND in Request.js
    ) else (
        echo executeEndpoint NOT FOUND in Request.js
    )
) else (
    echo Build FAILED
)
