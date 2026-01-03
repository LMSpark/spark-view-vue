# SPARK VIEW - 生产环境部署指南

## 目录

- [快速开始](#快速开始)
- [架构选择](#架构选择)
- [运行时架构部署](#运行时架构部署)
- [编译时架构部署](#编译时架构部署)
- [Docker部署](#docker部署)
- [云平台部署](#云平台部署)
- [监控与运维](#监控与运维)
- [常见问题](#常见问题)

---

## 快速开始

### 前置要求

- Node.js >= 16
- pnpm >= 8
- Docker & Docker Compose（Docker部署）
- Redis（运行时架构）

### 一键部署

```bash
# Linux/Mac
./scripts/deploy-prod.sh

# Windows
scripts\deploy-prod.bat
```

---

## 架构选择

### 运行时架构（SSR + SPA）

**适用场景**：
- ✅ 内容频繁更新
- ✅ 需要SEO优化
- ✅ 追求极致首屏性能
- ✅ 个性化推荐

**技术栈**：
- Node.js + Express
- Redis（缓存）
- MongoDB（可选，DSL存储）

### 编译时架构（纯SPA）

**适用场景**：
- ✅ 内容相对稳定
- ✅ 官网、文档站
- ✅ 简化部署
- ✅ 全球CDN加速

**技术栈**：
- 静态文件服务器（Nginx / Caddy）
- CDN（Cloudflare / AWS CloudFront）

---

## 运行时架构部署

### 1. 环境配置

复制环境变量文件：

```bash
cp .env.production .env
```

编辑 `.env`：

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600
LOG_LEVEL=info
```

### 2. 构建项目

```bash
# 安装依赖
pnpm install --frozen-lockfile

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 类型检查
pnpm typecheck
```

### 3. 启动服务

```bash
# 启动 API Server
pnpm start:prod

# 或使用 PM2
pm2 start packages/api-server/dist/server.js --name spark-api
pm2 startup
pm2 save
```

### 4. Nginx配置

```nginx
# /etc/nginx/sites-available/spark-view
server {
    listen 80;
    server_name yourdomain.com;

    # API 代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态文件
    location / {
        root /var/www/spark-view;
        try_files $uri $uri/ /index.html;
    }
}
```

启动 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/spark-view /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 编译时架构部署

### 1. 构建静态文件

```bash
# 构建静态 SPA
pnpm build:static

# 或使用 CLI
npx spark-build build \
  -i examples/my-app.json \
  -o dist \
  --minify \
  --base-url https://cdn.example.com
```

生成产物：

```
dist/
  ├── index.html
  ├── app.js
  ├── router.js
  └── app.css
```

### 2. 部署到静态服务器

#### Nginx

```bash
# 复制文件到 Nginx 目录
sudo cp -r dist/* /var/www/html/

# 配置 Nginx
sudo vim /etc/nginx/sites-available/default
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Apache

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    DocumentRoot /var/www/html

    <Directory /var/www/html>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # SPA 路由支持
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
</VirtualHost>
```

### 3. CDN 部署

#### Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel --prod

# 或使用 package.json 脚本
pnpm deploy:vercel
```

`vercel.json`：

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/dist/$1"
    }
  ],
  "headers": [
    {
      "source": "/(.*\\.(js|css|png|jpg|jpeg|gif|ico|svg))",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

#### Netlify

```bash
# 安装 Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --prod --dir=dist

# 或使用 package.json 脚本
pnpm deploy:netlify
```

`netlify.toml`：

```toml
[build]
  publish = "dist"
  command = "pnpm build:static"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

#### AWS S3 + CloudFront

```bash
# 上传到 S3
aws s3 sync dist/ s3://my-bucket/ --delete

# 配置 S3 静态网站托管
aws s3 website s3://my-bucket/ \
  --index-document index.html \
  --error-document index.html

# 清除 CloudFront 缓存
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

---

## Docker部署

### 1. 使用 Docker Compose

```bash
# 构建镜像
docker-compose build

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. 服务说明

```yaml
services:
  nginx:        # 反向代理，端口 80/443
  api-server:   # API Server，3个副本
  redis:        # 缓存，端口 6379
  mongodb:      # 数据库（可选）
  prometheus:   # 监控，端口 9090
  grafana:      # 可视化，端口 3001
```

### 3. 扩容

```bash
# 扩容 API Server 到 5 个实例
docker-compose up -d --scale api-server=5

# 查看状态
docker-compose ps
```

### 4. 备份与恢复

```bash
# 备份 Redis 数据
docker exec spark-redis redis-cli SAVE
docker cp spark-redis:/data/dump.rdb ./backup/

# 备份 MongoDB 数据
docker exec spark-mongodb mongodump --out /backup
docker cp spark-mongodb:/backup ./backup/mongodb/

# 恢复 Redis
docker cp ./backup/dump.rdb spark-redis:/data/
docker-compose restart redis

# 恢复 MongoDB
docker cp ./backup/mongodb/ spark-mongodb:/backup
docker exec spark-mongodb mongorestore /backup
```

---

## 云平台部署

### AWS

#### ECS (Elastic Container Service)

1. 推送镜像到 ECR

```bash
# 登录 ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

# 标记镜像
docker tag spark-api:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/spark-api:latest

# 推送
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/spark-api:latest
```

2. 创建 ECS 任务定义
3. 部署到 ECS 集群

#### Elastic Beanstalk

```bash
# 初始化
eb init -p docker spark-view

# 部署
eb create production-env
eb deploy
```

### Google Cloud

#### Cloud Run

```bash
# 构建并推送
gcloud builds submit --tag gcr.io/PROJECT_ID/spark-api

# 部署
gcloud run deploy spark-api \
  --image gcr.io/PROJECT_ID/spark-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Azure

#### Container Instances

```bash
# 创建容器组
az container create \
  --resource-group myResourceGroup \
  --name spark-api \
  --image myregistry.azurecr.io/spark-api:latest \
  --cpu 2 \
  --memory 4 \
  --registry-login-server myregistry.azurecr.io \
  --registry-username myUsername \
  --registry-password myPassword \
  --dns-name-label spark-api \
  --ports 3000
```

---

## 监控与运维

### 1. 健康检查

```bash
# Nginx 健康检查
curl http://localhost/nginx-health

# API Server 健康检查
curl http://localhost/api/health
```

### 2. Prometheus 监控

访问 `http://localhost:9090`

关键指标：
- HTTP 请求数
- 响应时间（P50/P95/P99）
- 缓存命中率
- 错误率
- CPU/内存使用率

### 3. Grafana 可视化

访问 `http://localhost:3001`

默认账号：`admin` / `admin123`

导入仪表盘：
- Node.js 应用监控
- Redis 监控
- Nginx 监控

### 4. 日志管理

```bash
# Docker 日志
docker-compose logs -f api-server

# 导出日志
docker-compose logs api-server > api-server.log

# 实时监控
tail -f /var/log/nginx/access.log
```

### 5. 性能分析

```bash
# Node.js 性能分析
node --prof packages/api-server/dist/server.js
node --prof-process isolate-*.log > processed.txt

# 压力测试
ab -n 10000 -c 100 http://localhost/api/render?dslId=test&path=/
```

---

## 常见问题

### Q1: 如何实现零停机部署？

**A:** 使用滚动更新策略

```bash
# Docker Compose
docker-compose up -d --no-deps --scale api-server=6 api-server
sleep 30
docker-compose up -d --no-deps --scale api-server=3 api-server

# Kubernetes
kubectl set image deployment/spark-api spark-api=spark-api:v2
kubectl rollout status deployment/spark-api
```

### Q2: 如何配置 HTTPS？

**A:** 使用 Let's Encrypt

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

### Q3: Redis 连接失败怎么办?

**A:** 检查配置和网络

```bash
# 测试连接
redis-cli -h localhost -p 6379 ping

# 检查 Docker 网络
docker network inspect spark-network

# 查看 Redis 日志
docker-compose logs redis
```

### Q4: 如何优化性能？

**A:** 

1. **启用 Redis 缓存**
2. **配置 Nginx Gzip 压缩**
3. **使用 CDN 加速静态资源**
4. **启用 HTTP/2**
5. **优化 Docker 镜像大小**

### Q5: 如何回滚版本？

**A:**

```bash
# Docker Compose
docker-compose down
git checkout v1.0.0
docker-compose up -d

# Kubernetes
kubectl rollout undo deployment/spark-api
```

---

## 相关文档

- [混合架构详解](../docs/series/11-hybrid-ssr-spa.md)
- [协商缓存机制](../docs/cache-negotiation.md)
- [运行时 vs 编译时架构](../docs/runtime-vs-buildtime.md)

---

**技术支持**: 如有问题，请提交 GitHub Issue
