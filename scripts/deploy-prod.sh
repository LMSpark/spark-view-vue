#!/bin/bash

# 生产环境部署脚本
# 使用方法: ./scripts/deploy-prod.sh

set -e

echo "🚀 开始生产环境部署..."

# 1. 环境检查
echo "📋 检查环境..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

# 2. 拉取最新代码
echo "📦 拉取最新代码..."
git pull origin main

# 3. 安装依赖
echo "📦 安装依赖..."
pnpm install --frozen-lockfile

# 4. 运行测试
echo "🧪 运行测试..."
pnpm test

# 5. 类型检查
echo "🔍 类型检查..."
pnpm typecheck

# 6. 构建项目
echo "🔨 构建项目..."
pnpm build:prod

# 7. 构建 Docker 镜像
echo "🐳 构建 Docker 镜像..."
docker-compose build --no-cache

# 8. 停止旧容器
echo "🛑 停止旧容器..."
docker-compose down

# 9. 启动新容器
echo "▶️  启动新容器..."
docker-compose up -d

# 10. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 11. 健康检查
echo "🏥 健康检查..."
if curl -f http://localhost/nginx-health > /dev/null 2>&1; then
    echo "✅ Nginx 健康检查通过"
else
    echo "❌ Nginx 健康检查失败"
    exit 1
fi

if curl -f http://localhost/api/health > /dev/null 2>&1; then
    echo "✅ API Server 健康检查通过"
else
    echo "❌ API Server 健康检查失败"
    exit 1
fi

# 12. 显示容器状态
echo "📊 容器状态:"
docker-compose ps

# 13. 显示日志
echo "📝 最近日志:"
docker-compose logs --tail=20

echo "✅ 部署完成！"
echo "🌐 访问地址:"
echo "   - 前端: http://localhost"
echo "   - API: http://localhost/api"
echo "   - Prometheus: http://localhost:9090"
echo "   - Grafana: http://localhost:3001"
