@echo off
cd /d D:\SPARK_VIEW
echo Adding files...
git add -A
echo.
echo Committing...
git commit -m "refactor: 权限快照系统和数据清理优化

- 实现JWT-like权限快照系统，避免服务端重复计算
- 统一CrudOperationConfig权限对象传递设计
- 添加数据上传时权限字段自动清理功能
- 重命名DataView.hostTable为tableName保持一致性
- 新增权限数据清理测试用例
- 优化类型定义和注释

影响范围: @spark-view/spark-data"
echo.
echo Pushing...
git push
echo.
echo Done!
pause
