@echo off
cd /d D:\SPARK_VIEW
echo Adding files...
git add -A
echo.
echo Committing...
REM 支持：commit-push.cmd "your commit message"
if "%~1"=="" (
  git commit -m "chore: <短描述（必填）>

- 描述: <一句话说明本次改动>
- 变更点: <高层要点，逗号分隔>
- 影响范围: <packages/...>
- 测试: <unit tests / manual checks>

请在运行脚本时替换引号内占位符，或通过参数传入具体提交信息。"
) else (
  git commit -m "%~1"
)

echo.
echo Pushing...
git push
echo.
echo Done!
pause
