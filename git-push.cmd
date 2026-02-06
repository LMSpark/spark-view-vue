@echo off
cd /d d:\SPARK_VIEW
echo === Checking git status ===
git status --short

echo.
echo === Adding all files ===
git add .

echo.
echo === Creating commit ===
git commit -m "refactor: simplify Vue plugin API - hide Manager from developers"

echo.
echo === Current branch ===
git branch --show-current

echo.
echo === Pushing to remote ===
git push

echo.
echo === Done! ===
pause
