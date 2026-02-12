@echo off
cd /d D:\SPARK_VIEW
echo Adding files...
git add -A
echo.
echo Committing...
git commit -m "refactor: 统一 HTTP 请求层，移除 ApiAdapter

- 移除重复代码: 删除 ApiAdapter 类，统一使用 Request.executeEndpoint()
- Request 重构: 从 fetch 迁移到 axios
  - 添加 executeEndpoint() 方法支持端点配置
  - 内置认证和租户拦截器
  - 统一 HttpRequestConfig 接口
- 类型系统改进:
  - HttpEndpoint 基于 HttpRequestConfig
  - 导出类型定义到 spark-utils
- 日志系统改进: 使用 Logger 替代 console
- 测试代码重构: 更新为 axios mock
- 构建改进: 修复类型检查配置

影响范围: @spark-view/spark-data, @spark-view/spark-utils"
echo.
echo Pushing...
git push
echo.
echo Done!
pause
