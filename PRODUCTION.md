# 🚀 生产环境快速参考

## 一键部署

```bash
# Linux/Mac
./scripts/deploy-prod.sh

# Windows
scripts\deploy-prod.bat
```

## 核心命令

### 开发环境
```bash
pnpm dev:api      # 启动 API Server（端口 3000）
pnpm dev:demo     # 启动 Demo Site（端口 5174）
```

### 生产环境
```bash
pnpm build:prod   # 构建所有包 + 静态文件
pnpm start:prod   # 启动 API Server（生产模式）
```

### Docker
```bash
docker-compose build     # 构建镜像
docker-compose up -d     # 启动所有服务
docker-compose ps        # 查看状态
docker-compose logs -f   # 查看日志
docker-compose down      # 停止服务
```

## 服务端口

| 服务 | 端口 | 用途 |
|-----|------|------|
| Nginx | 80/443 | 反向代理 + 静态文件 |
| API Server | 3000 | SSR 渲染 + DSL 管理 |
| Redis | 6379 | 缓存 |
| MongoDB | 27017 | 数据持久化 |
| Prometheus | 9090 | 监控指标 |
| Grafana | 3001 | 可视化面板 |

## 健康检查

```bash
# Nginx
curl http://localhost/nginx-health

# API Server
curl http://localhost/api/health

# Redis
docker exec spark-redis redis-cli ping
```

## 常用操作

### 查看日志
```bash
# API Server 日志
docker-compose logs -f api-server

# Nginx 日志
docker-compose logs -f nginx

# 所有服务日志
docker-compose logs -f
```

### 扩容
```bash
# 扩容 API Server 到 5 个实例
docker-compose up -d --scale api-server=5
```

### 备份数据
```bash
# 备份 Redis
docker exec spark-redis redis-cli SAVE
docker cp spark-redis:/data/dump.rdb ./backup/

# 备份 MongoDB
docker exec spark-mongodb mongodump --out /backup
docker cp spark-mongodb:/backup ./backup/mongodb/
```

### 清理缓存
```bash
# 清理所有缓存
curl -X POST http://localhost/api/cache/clear

# 清理特定 DSL 缓存
curl -X POST http://localhost/api/cache/invalidate/my-app
```

## 环境变量

关键环境变量（`.env.production`）：

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
CACHE_TTL=3600
LOG_LEVEL=info
```

## 监控指标

访问 Grafana：http://localhost:3001
- 默认账号：`admin`
- 默认密码：`admin123`

关键指标：
- HTTP 请求数
- 响应时间（P50/P95/P99）
- 缓存命中率
- 错误率
- CPU/内存使用率

## 故障排查

### API Server 启动失败
```bash
# 查看日志
docker-compose logs api-server

# 检查端口占用
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/Mac
```

### Redis 连接失败
```bash
# 测试连接
redis-cli -h localhost -p 6379 ping

# 检查容器网络
docker network inspect spark-network

# 重启 Redis
docker-compose restart redis
```

### Nginx 502 错误
```bash
# 检查 upstream 状态
curl http://api-server:3000/health

# 检查 Nginx 配置
docker exec spark-nginx nginx -t

# 重新加载配置
docker-compose restart nginx
```

## 性能优化

### 1. 启用 Redis 持久化
```bash
# 修改 docker-compose.yml
redis:
  command: redis-server --appendonly yes --save 60 1
```

### 2. 配置 Nginx 缓存
```nginx
# 增加 nginx.conf 缓存时间
proxy_cache_valid 200 304 30m;
```

### 3. 启用 Gzip 压缩
```nginx
# nginx.conf 已默认启用
gzip on;
gzip_comp_level 6;
```

### 4. 增加 Node.js 内存限制
```yaml
# docker-compose.yml
api-server:
  environment:
    - NODE_OPTIONS=--max-old-space-size=4096
```

## 安全加固

### 1. 配置 HTTPS
```bash
# 使用 Let's Encrypt
certbot --nginx -d yourdomain.com
```

### 2. 限流配置
```nginx
# nginx.conf
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_req zone=api_limit burst=20 nodelay;
```

### 3. 设置 Redis 密码
```yaml
# docker-compose.yml
redis:
  command: redis-server --requirepass your_password
```

## 回滚版本

```bash
# Git 回滚
git checkout v1.0.0
docker-compose down
docker-compose up -d

# Kubernetes 回滚
kubectl rollout undo deployment/spark-api
```

## 更多帮助

- 📖 [完整部署指南](./DEPLOYMENT.md)
- 🏗️ [混合架构文档](./docs/series/11-hybrid-ssr-spa.md)
- 💬 [GitHub Issues](https://github.com/your-org/spark-view-vue/issues)
