#!/bin/bash
# 生产部署脚本

echo "🚀 开始生产部署..."

# 1. 构建优化版本
echo "📦 构建应用..."
npm run build:spa

# 2. 压缩静态资源 (可选)
echo "🗜️ 压缩资源文件..."
find dist -name "*.js" -exec gzip -k {} \;
find dist -name "*.css" -exec gzip -k {} \;

# 3. 生成资源清单
echo "📋 生成资源清单..."
cat > dist/manifest.json << EOF
{
  "build_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "$(git rev-parse --short HEAD)",
  "files": {
    "js": [$(find dist/js -name "*.js" -printf '"%f",' | sed 's/,$//')]
    "css": [$(find dist/css -name "*.css" -printf '"%f",' | sed 's/,$//')]
  }
}
EOF

# 4. 部署到服务器 (根据你的部署方式调整)
echo "🌐 部署到生产服务器..."
# rsync -avz --delete dist/ user@server:/var/www/html/
# 或者上传到云存储
# aws s3 sync dist/ s3://your-bucket/ --delete

echo "✅ 部署完成！"
echo "📊 建议运行 Lighthouse 检查性能"