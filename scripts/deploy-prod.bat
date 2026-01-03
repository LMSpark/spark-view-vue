@echo off
REM 生产环境部署脚本（Windows）
REM 使用方法: scripts\deploy-prod.bat

echo 🚀 开始生产环境部署...

REM 1. 环境检查
echo 📋 检查环境...
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker 未安装
    exit /b 1
)

where docker-compose >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker Compose 未安装
    exit /b 1
)

REM 2. 拉取最新代码
echo 📦 拉取最新代码...
git pull origin main
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Git pull 失败
    exit /b 1
)

REM 3. 安装依赖
echo 📦 安装依赖...
call pnpm install --frozen-lockfile
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 依赖安装失败
    exit /b 1
)

REM 4. 运行测试
echo 🧪 运行测试...
call pnpm test
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 测试失败
    exit /b 1
)

REM 5. 类型检查
echo 🔍 类型检查...
call pnpm typecheck
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 类型检查失败
    exit /b 1
)

REM 6. 构建项目
echo 🔨 构建项目...
call pnpm build:prod
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 构建失败
    exit /b 1
)

REM 7. 构建 Docker 镜像
echo 🐳 构建 Docker 镜像...
docker-compose build --no-cache
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker 构建失败
    exit /b 1
)

REM 8. 停止旧容器
echo 🛑 停止旧容器...
docker-compose down

REM 9. 启动新容器
echo ▶️  启动新容器...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 容器启动失败
    exit /b 1
)

REM 10. 等待服务启动
echo ⏳ 等待服务启动...
timeout /t 10 /nobreak >nul

REM 11. 健康检查
echo 🏥 健康检查...
curl -f http://localhost/nginx-health >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ Nginx 健康检查通过
) else (
    echo ❌ Nginx 健康检查失败
    exit /b 1
)

curl -f http://localhost/api/health >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo ✅ API Server 健康检查通过
) else (
    echo ❌ API Server 健康检查失败
    exit /b 1
)

REM 12. 显示容器状态
echo 📊 容器状态:
docker-compose ps

REM 13. 显示日志
echo 📝 最近日志:
docker-compose logs --tail=20

echo ✅ 部署完成！
echo 🌐 访问地址:
echo    - 前端: http://localhost
echo    - API: http://localhost/api
echo    - Prometheus: http://localhost:9090
echo    - Grafana: http://localhost:3001
