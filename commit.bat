@echo off
chcp 65001 >nul
cd /d d:\SPARK_VIEW

echo 🚀 提交并推送代码...
echo.

git add .
git commit -m "refactor: simplify Vue plugin API and unify component system creation"
git push

echo.
echo ✅ 完成！
pause
