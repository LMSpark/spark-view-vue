# 07 - CI/CD 与自动化部署

> 本文介绍如何构建完整的 CI/CD 流程，实现自动化测试、构建和部署

## 1. CI/CD 架构设计

### 1.1 流水线概览

```
代码推送 → Lint → Test → Build → Deploy → Monitor
           ↓      ↓      ↓       ↓        ↓
         ESLint  Vitest  Vite   Vercel   Sentry
```

### 1.2 GitHub Actions 工作流

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run ESLint
        run: pnpm lint
      
      - name: Run Prettier check
        run: pnpm format:check

  test:
    name: Test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16, 18, 20]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run tests
        run: pnpm test:coverage
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build all packages
        run: pnpm -w build
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: |
            packages/*/dist
            packages/*/build

  validate:
    name: End-to-End Validation
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: dist
      
      - name: Run validation script
        run: bash scripts/validate.sh
      
      - name: Run performance tests
        run: node scripts/performance-test.js
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: validation-report
          path: validation-report.json
```

## 2. 部署工作流

### 2.1 自动部署到 Vercel

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  deploy-demo:
    name: Deploy Demo Site
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build demo site
        run: pnpm --filter demo-site build
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./packages/demo-site
          vercel-args: '--prod'

  deploy-ssr-server:
    name: Deploy SSR Server
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./packages/ssr-server/Dockerfile
          push: true
          tags: |
            your-org/spark-view-ssr:latest
            your-org/spark-view-ssr:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Deploy to production
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/spark-view
            docker-compose pull
            docker-compose up -d
            docker-compose exec -T ssr-server pnpm health-check

  publish-npm:
    name: Publish to NPM
    runs-on: ubuntu-latest
    if: github.event_name == 'release'
    needs: [deploy-demo, deploy-ssr-server]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build all packages
        run: pnpm -w build
      
      - name: Publish packages
        run: pnpm -r publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 3. Docker 容器化

### 3.1 SSR Server Dockerfile

```dockerfile
# packages/ssr-server/Dockerfile
FROM node:18-alpine AS base

# 安装 pnpm
RUN npm install -g pnpm@8

# 设置工作目录
WORKDIR /app

# 复制依赖配置
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/dsl-spec/package.json ./packages/dsl-spec/
COPY packages/dsl-parser/package.json ./packages/dsl-parser/
COPY packages/dsl-compiler/package.json ./packages/dsl-compiler/
COPY packages/ssr-server/package.json ./packages/ssr-server/

# 安装依赖
FROM base AS dependencies
RUN pnpm install --frozen-lockfile --prod

# 构建阶段
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm -w build

# 生产镜像
FROM node:18-alpine AS production

# 安装 pnpm
RUN npm install -g pnpm@8

WORKDIR /app

# 复制依赖
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages ./packages

# 复制构建产物
COPY --from=build /app/packages/dsl-spec/dist ./packages/dsl-spec/dist
COPY --from=build /app/packages/dsl-parser/dist ./packages/dsl-parser/dist
COPY --from=build /app/packages/dsl-compiler/dist ./packages/dsl-compiler/dist
COPY --from=build /app/packages/ssr-server/dist ./packages/ssr-server/dist

# 复制配置文件
COPY package.json pnpm-workspace.yaml ./

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["pnpm", "--filter", "@spark-view/ssr-server", "start"]
```

### 3.2 Docker Compose 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  ssr-server:
    build:
      context: .
      dockerfile: packages/ssr-server/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ssr-server
    restart: unless-stopped

volumes:
  redis-data:
```

### 3.3 Nginx 反向代理配置

```nginx
# nginx.conf
events {
  worker_connections 1024;
}

http {
  upstream ssr_backend {
    server ssr-server:3000;
    keepalive 32;
  }

  # 缓存配置
  proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=spark_cache:10m max_size=1g inactive=60m use_temp_path=off;

  server {
    listen 80;
    server_name spark-view.example.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name spark-view.example.com;

    # SSL 证书
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # 健康检查
    location /health {
      proxy_pass http://ssr_backend;
      access_log off;
    }

    # 渲染端点
    location /render {
      proxy_pass http://ssr_backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;

      # 缓存配置
      proxy_cache spark_cache;
      proxy_cache_key "$scheme$request_method$host$request_uri";
      proxy_cache_valid 200 60s;
      proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
      proxy_cache_background_update on;
      proxy_cache_lock on;

      add_header X-Cache-Status $upstream_cache_status;
    }

    # 静态资源
    location /static {
      proxy_pass http://ssr_backend;
      proxy_cache spark_cache;
      proxy_cache_valid 200 1d;
      expires 1d;
      add_header Cache-Control "public, immutable";
    }
  }
}
```

## 4. 监控与告警

### 4.1 Prometheus 监控

```typescript
// packages/ssr-server/src/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

export class Metrics {
  private static httpRequestsTotal = new Counter({
    name: 'spark_view_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status'],
  });

  private static httpRequestDuration = new Histogram({
    name: 'spark_view_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  });

  private static cacheHits = new Counter({
    name: 'spark_view_cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type'],
  });

  private static cacheMisses = new Counter({
    name: 'spark_view_cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type'],
  });

  private static activeConnections = new Gauge({
    name: 'spark_view_active_connections',
    help: 'Number of active connections',
  });

  static recordRequest(method: string, path: string, status: number, duration: number): void {
    this.httpRequestsTotal.inc({ method, path, status });
    this.httpRequestDuration.observe({ method, path, status }, duration);
  }

  static recordCacheHit(cacheType: string): void {
    this.cacheHits.inc({ cache_type: cacheType });
  }

  static recordCacheMiss(cacheType: string): void {
    this.cacheMisses.inc({ cache_type: cacheType });
  }

  static setActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }

  static getRegistry() {
    return register;
  }
}

// packages/ssr-server/src/server.ts
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### 4.2 健康检查端点

```typescript
// packages/ssr-server/src/health.ts
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: number;
  uptime: number;
  checks: {
    redis?: { status: string; latency?: number };
    memory?: { status: string; usage: number };
    cpu?: { status: string; usage: number };
  };
}

export class HealthCheck {
  async check(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};

    // Redis 检查
    try {
      const start = Date.now();
      await redisClient.ping();
      checks.redis = {
        status: 'ok',
        latency: Date.now() - start,
      };
    } catch (error) {
      checks.redis = { status: 'error' };
    }

    // 内存检查
    const memUsage = process.memoryUsage();
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    checks.memory = {
      status: memUsagePercent < 90 ? 'ok' : 'warning',
      usage: memUsagePercent,
    };

    // CPU 检查
    const cpuUsage = process.cpuUsage();
    checks.cpu = {
      status: 'ok',
      usage: cpuUsage.system + cpuUsage.user,
    };

    const isHealthy = 
      checks.redis?.status === 'ok' &&
      checks.memory?.status !== 'error' &&
      checks.cpu?.status !== 'error';

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      checks,
    };
  }
}

// 路由
app.get('/health', async (req, res) => {
  const healthCheck = new HealthCheck();
  const result = await healthCheck.check();
  
  res.status(result.status === 'healthy' ? 200 : 503).json(result);
});
```

### 4.3 错误追踪（Sentry）

```typescript
// packages/ssr-server/src/server.ts
import * as Sentry from '@sentry/node';

// 初始化 Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend(event, hint) {
    // 过滤敏感信息
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers?.authorization;
    }
    return event;
  },
});

// 请求追踪
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// 错误处理
app.use(Sentry.Handlers.errorHandler());

// 自定义错误上报
try {
  await renderer.render(dslId, context);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      dsl_id: dslId,
      render_type: 'ssr',
    },
    extra: {
      context,
    },
  });
  throw error;
}
```

## 5. 日志聚合

### 5.1 结构化日志

```typescript
// packages/ssr-server/src/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'spark-view-ssr' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// 使用
logger.info('Rendering page', {
  dslId,
  cacheHit: true,
  duration: 45,
});

logger.error('Render failed', {
  dslId,
  error: error.message,
  stack: error.stack,
});
```

## 6. 性能监控

### 6.1 APM 集成（New Relic / Datadog）

```typescript
// packages/ssr-server/src/apm.ts
import newrelic from 'newrelic';

export function instrumentRender(dslId: string, fn: () => Promise<string>): Promise<string> {
  return newrelic.startSegment('render', true, async () => {
    const start = Date.now();
    
    try {
      const result = await fn();
      
      newrelic.recordMetric('Custom/Render/Success', 1);
      newrelic.recordMetric('Custom/Render/Duration', Date.now() - start);
      
      return result;
    } catch (error) {
      newrelic.recordMetric('Custom/Render/Error', 1);
      throw error;
    }
  });
}
```

## 7. 总结

本文构建了完整的 CI/CD 流程：

- **GitHub Actions**：自动化 Lint、Test、Build、Deploy
- **Docker 容器化**：多阶段构建，优化镜像大小
- **Nginx 反向代理**：负载均衡、SSL、缓存
- **监控告警**：Prometheus + Grafana + Sentry
- **日志聚合**：Winston + ELK Stack

完整流程：
```
Git Push → CI Tests → Docker Build → Deploy → Monitor → Alert
```

部署架构：
```
User → CDN → Nginx → SSR Server (Docker) → Redis
                                          ↓
                            Prometheus + Sentry
```

在下一篇文章中，我们将探讨性能优化技巧和最佳实践。
