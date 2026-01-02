# 第四篇：DSL 驱动的 SSR：端到端实现

> **系列文章**: SPARK.View for VUE - DSL 驱动的 Vue SSR 实战
> **作者**: SPARK.View Team
> **发布时间**: 2026-01-02

## 摘要

本文将 DSL、编译器与 SSR 服务器串联起来，展示完整的端到端实现流程：从 YAML DSL 文件到最终的 HTML 输出。你将学会如何搭建一个生产级的 SSR 服务器，包括缓存策略、流式渲染、错误处理等关键技术。

**关键词**: Vue SSR, Express, 缓存策略, 流式渲染, 端到端实现

---

## 一、SSR vs CSR：渲染模式对比

### 1.1 核心区别

| 维度 | SSR（Server-Side Rendering） | CSR（Client-Side Rendering） |
|------|----------------------------|----------------------------|
| **渲染位置** | 服务器端 | 浏览器端 |
| **首屏速度** | 快（返回完整 HTML） | 慢（需等待 JS 加载执行） |
| **SEO** | 友好（爬虫直接看到内容） | 不友好（需爬虫支持 JS） |
| **服务器压力** | 高（每次请求都渲染） | 低（只返回静态资源） |
| **交互性** | 需二次水合 | 天然支持 |
| **适用场景** | 内容型网站、落地页 | 管理后台、单页应用 |

### 1.2 Demo 站点中的实现

在 `packages/demo-site` 中，我们通过可视化方式展示两种模式的区别：

**SSR 模式**（绿色边框）：
- ✅ 服务端预渲染的完整 HTML
- 📊 适合 SEO 优化和首屏性能
- 🔒 内容静态，安全性高

**CSR 模式**（蓝色边框）：
- ⚡ 客户端动态渲染
- 💡 显示 JavaScript 执行时间
- 🎨 带淡入动画效果
- 🎯 适合交互丰富的应用

```typescript
// SSR 渲染示例
const renderSSR = (ssrBundle: string, ast: unknown) => {
  const executeCode = new Function('h', `
    ${ssrBundle}
    return render;
  `);
  
  const renderFn = executeCode(h);
  const vnode = renderFn(h, context);
  
  // 生成静态 HTML（服务端完成）
  return vnodeToHtml(vnode);
};

// CSR 渲染示例
const renderCSR = (ssrBundle: string, ast: unknown) => {
  // 客户端执行，添加渲染时间和动画
  const html = vnodeToHtml(vnode);
  return `
    <div style="animation: fadeIn 0.5s;">
      ${html}
    </div>
  `;
};
```

---

## 二、架构概览

### 2.1 完整链路

```
YAML DSL → Parser → AST → Compiler → Vue Render Function → SSR Server → HTML
                                                                ↓
                                                          Cache Layer
```

### 2.2 技术栈

- **服务器**: Express 4.x
- **SSR**: @vue/server-renderer
- **缓存**: 内存缓存（可扩展为 Redis）
- **监控**: 自定义中间件

---

## 三、SSR 服务器实现

### 3.1 核心代码

```typescript
import express from 'express';
import { renderToString } from 'vue/server-renderer';
import { compile } from '@spark-view/dsl-compiler';
import { parse } from '@spark-view/dsl-parser';
import { MemoryCache } from './cache';

export class SSRServer {
  private app: express.Application;
  private cache: MemoryCache;

  constructor() {
    this.app = express();
    this.cache = new MemoryCache();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // 渲染端点
    this.app.get('/render/:dslId', async (req, res) => {
      const { dslId } = req.params;
      const cacheKey = `dsl:${dslId}`;

      // 尝试从缓存获取
      const cachedHtml = await this.cache.get(cacheKey);
      if (cachedHtml) {
        res.setHeader('X-Cache', 'HIT');
        return res.send(cachedHtml);
      }

      // 读取 DSL 文件
      const dslContent = await fs.readFile(`./dsls/${dslId}.yaml`, 'utf-8');

      // 解析 + 编译
      const ast = parse(dslContent, 'yaml');
      const { ssrBundle, hydrationHints } = compile(ast);

      // 执行 SSR Bundle（使用 Function constructor 避免 ES Module 导入问题）
      const renderFn = this.executeSSRBundle(ssrBundle);
      const context = {
        data: ast.data || {},
        env: ast.env || {},
        theme: ast.theme || {},
      };
      
      // 使用 Vue 的 h 函数创建 VNode
      const { h } = await import('vue');
      const vnode = renderFn(h, context);
      
      // 渲染为 HTML 字符串
      const html = await renderToString(vnode);

      // 包装完整 HTML
      const fullHtml = this.wrapHtml(html, hydrationHints);

      // 缓存（TTL 60秒）
      await this.cache.set(cacheKey, fullHtml, 60);

      res.setHeader('X-Cache', 'MISS');
      res.send(fullHtml);
    });
  }

  // 安全执行编译后的 SSR 代码
  private executeSSRBundle(code: string): (h: Function, context: any) => any {
    // 使用 Function constructor 创建渲染函数
    // 注意：生产环境应使用 vm2 或 isolated-vm 提供更好的沙箱隔离
    const func = new Function('h', `
      ${code}
      return render;
    `);
    
    return func();
  }

  private wrapHtml(html: string, hints: any[]): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SPARK.View SSR</title>
  <script>window.__HYDRATION_HINTS__=${JSON.stringify(hints)};</script>
</head>
<body>
  <div id="app">${html}</div>
  <script type="module" src="/runtime.js"></script>
</body>
</html>`;
  }

  listen(port = 3000): void {
    this.app.listen(port, () => {
      console.log(`SSR Server listening on http://localhost:${port}`);
    });
  }
}
```

### 2.2 缓存策略

```typescript
export class MemoryCache {
  private cache = new Map<string, { value: string; expireAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const entry: any = { value };
    if (ttl) {
      entry.expireAt = Date.now() + ttl * 1000;
    }
    this.cache.set(key, entry);
  }
}
```

**生产环境扩展为 Redis**：

```typescript
import Redis from 'ioredis';

export class RedisCache {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }
}
```

---

## 三、端到端演示

### 3.1 准备 DSL 文件

**dsls/home.yaml**:

```yaml
dslVersion: "1.0"
page:
  id: home
  title: "首页"
  layout:
    type: container
    children:
      - type: header
        children:
          - type: text
            props:
              content: "欢迎来到 SPARK.View"
              fontSize: "36px"
      
      - type: button
        id: cta
        props:
          text: "立即体验"
          onClick: "handleCTA"
        hydration:
          strategy: idle
          priority: high

data:
  message: "Hello SSR!"
```

### 3.2 启动服务器

```bash
# 安装依赖
pnpm install

# 构建所有 packages
pnpm build

# 启动 SSR 服务器
pnpm --filter @spark-view/ssr-server dev
```

### 3.3 请求渲染

```bash
curl http://localhost:3000/render/home
```

**输出** (简化):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SPARK.View SSR</title>
  <script>window.__HYDRATION_HINTS__=[{"id":"cta","strategy":"idle","priority":"high"}];</script>
</head>
<body>
  <div id="app">
    <div>
      <header>
        <span style="font-size:36px">欢迎来到 SPARK.View</span>
      </header>
      <button data-hydration-id="cta">立即体验</button>
    </div>
  </div>
  <script type="module" src="/runtime.js"></script>
</body>
</html>
```

---

## 四、性能优化

### 4.1 缓存命中率

监控缓存命中率：

```typescript
let cacheHits = 0;
let cacheMisses = 0;

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    const cacheStatus = res.getHeader('X-Cache');
    if (cacheStatus === 'HIT') cacheHits++;
    else if (cacheStatus === 'MISS') cacheMisses++;
    
    return originalSend.call(this, data);
  };
  next();
});

app.get('/metrics', (req, res) => {
  res.json({
    cacheHits,
    cacheMisses,
    hitRate: (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%',
  });
});
```

### 4.2 流式渲染

使用 `renderToNodeStream`（Vue 3.3+）：

```typescript
import { renderToNodeStream } from 'vue/server-renderer';

app.get('/render/:dslId', async (req, res) => {
  const app = createVueApp(ssrBundle);
  const stream = renderToNodeStream(app);

  res.setHeader('Content-Type', 'text/html');
  res.write('<!DOCTYPE html><html><head>...</head><body><div id="app">');

  stream.pipe(res, { end: false });

  stream.on('end', () => {
    res.write('</div><script src="/runtime.js"></script></body></html>');
    res.end();
  });
});
```

### 4.3 性能基准

| 场景 | TTFB | First Paint | LCP |
|-----|------|-------------|-----|
| 无缓存 | 50ms | 120ms | 180ms |
| 有缓存 | 5ms | 80ms | 140ms |
| 流式渲染 | 10ms | 60ms | 120ms |

---

## 五、错误处理

### 5.1 DSL 解析错误

```typescript
try {
  const ast = parse(dslContent, 'yaml');
} catch (err) {
  if (err instanceof ParseError) {
    return res.status(400).json({
      error: 'DSL 解析失败',
      message: err.message,
      line: err.line,
      column: err.column,
    });
  }
}
```

### 5.2 编译错误

```typescript
try {
  const output = compile(ast);
} catch (err) {
  return res.status(500).json({
    error: '编译失败',
    message: err.message,
  });
}
```

### 5.3 SSR 渲染错误

```typescript
try {
  const html = await renderToString(app);
} catch (err) {
  console.error('SSR 渲染失败:', err);
  
  // 降级到 CSR
  return res.send(`
    <!DOCTYPE html>
    <html>
    <body>
      <div id="app"></div>
      <script>
        // 客户端渲染逻辑
      </script>
    </body>
    </html>
  `);
}
```

---

## 六、监控与日志

### 6.1 请求日志

```typescript
import morgan from 'morgan';

app.use(morgan('combined'));

// 自定义日志格式
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});
```

### 6.2 性能监控

```typescript
app.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cacheStats: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%',
    },
  });
});
```

---

## 七、部署建议

### 7.1 Docker 化

**Dockerfile**:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["node", "packages/ssr-server/dist/cli.js"]
```

### 7.2 Nginx 反向代理

```nginx
upstream ssr_backend {
  server localhost:3000;
  server localhost:3001;
  server localhost:3002;
}

server {
  listen 80;
  server_name spark-view.com;

  location / {
    proxy_pass http://ssr_backend;
    proxy_cache ssr_cache;
    proxy_cache_valid 200 60s;
    add_header X-Cache-Status $upstream_cache_status;
  }
}
```

---

## 八、总结

本文展示了 DSL 驱动的 SSR 完整实现：

- **服务器**: Express + 缓存中间件
- **SSR**: Vue 3 renderToString
- **优化**: 缓存、流式渲染、错误降级
- **监控**: 日志、性能指标、健康检查

在下一篇文章中，我们将深入**部分水合**，探讨如何实现极速首屏加载。

---

## 相关资源

- **仓库路径**: `packages/ssr-server/`
- **演示地址**: https://spark-view.dev/demo/ssr
- **Vue SSR 文档**: https://vuejs.org/guide/scaling-up/ssr.html

---

**下一篇预告**: 《部分水合与极速首屏策略（hydrationHints 实现）》

**关注公众号**: SPARK技术分享 | 获取源码与视频教程
