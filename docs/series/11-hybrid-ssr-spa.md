# 第十一篇：混合架构 - SSR首屏 + SPA导航

## 摘要

深入解析SPARK VIEW的混合架构设计，实现SSR快速首屏和SPA流畅导航的完美结合，同时支持按需编译和页面级缓存。

## 1. 架构概述

### 1.1 为什么需要混合架构？

**纯SSR的问题**：
- ❌ 每次导航都需要完整页面刷新
- ❌ 重复加载相同的资源
- ❌ 用户体验不够流畅

**纯SPA的问题**：
- ❌ 首屏加载慢，白屏时间长
- ❌ SEO不友好
- ❌ TTFB（首字节时间）高

**混合架构的优势**：
- ✅ SSR快速首屏 + SEO友好
- ✅ SPA流畅导航 + 无刷新体验
- ✅ 按需编译 + 页面级缓存
- ✅ 增量更新 + 高效部署

### 1.2 架构流程图

```
┌─────────────────────────────────────────────────────┐
│ 1. 首次访问 /detail/123                              │
│    用户在浏览器输入URL或点击链接                      │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 2. Nginx转发到API Server                             │
│    GET /api/render?dslId=xxx&path=/detail/123        │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 3. 检查Redis缓存                                     │
│    - spark:dsl:xxx:page:detail (页面HTML)            │
│    - spark:dsl:xxx:router (路由配置)                 │
└─────────────────────┬───────────────────────────────┘
            命中 ↙          ↘ 未命中
    ┌──────────┘              └──────────┐
    ↓                                     ↓
┌──────────┐                    ┌──────────────────┐
│ 返回缓存  │                    │ 4. 编译DSL        │
└──────────┘                    │  - 解析DSL文档     │
                                │  - 只编译当前页面  │
                                │  - 生成路由配置    │
                                └────────┬─────────┘
                                         ↓
                                ┌──────────────────┐
                                │ 5. 存入Redis缓存  │
                                │  - 页面级缓存     │
                                │  - TTL: 1小时     │
                                └────────┬─────────┘
                                         ↓
┌─────────────────────────────────────────────────────┐
│ 6. 返回混合响应                                       │
│   {                                                  │
│     html: "<div>SSR内容</div>",                      │
│     routerConfig: "export default {...}",            │
│     lazyComponents: {                                │
│       "home": "/api/component/xxx/home",             │
│       "list": "/api/component/xxx/list"              │
│     },                                               │
│     initialData: { currentPath, dslId, pageId }      │
│   }                                                  │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 7. 浏览器接收响应                                     │
│    - 显示SSR渲染的HTML（快速首屏）                    │
│    - 加载Vue应用和路由配置                            │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 8. Vue应用Hydration                                  │
│    - createApp() 创建Vue实例                         │
│    - createRouter() 使用服务端路由配置                │
│    - app.mount('#app') 接管SSR内容                   │
└─────────────────────┬───────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 9. SPA模式激活                                        │
│    用户点击导航 → 客户端路由切换 → 无刷新更新          │
│    懒加载组件按需下载                                 │
└─────────────────────────────────────────────────────┘
```

## 2. 核心组件

### 2.1 API Server

**职责**：
- 处理SSR渲染请求
- 管理DSL存储（CRUD）
- 控制Redis缓存
- 提供懒加载组件

**关键接口**：

```typescript
// SSR渲染接口
GET /api/render?dslId=xxx&path=/detail/123

响应：
{
  html: string,              // SSR首屏HTML
  routerConfig: string,      // 完整路由配置
  lazyComponents: {...},     // 懒加载组件URL映射
  initialData: {...},        // 首屏数据
  meta: {
    cacheHit: boolean,       // 缓存命中状态
    timestamp: number        // 时间戳
  }
}

// DSL管理接口
POST   /api/dsl              // 保存DSL
GET    /api/dsl/:id          // 获取DSL
PUT    /api/dsl/:id/pages/:pageId  // 更新单页面
DELETE /api/dsl/:id          // 删除DSL
POST   /api/cache/invalidate/:dslId // 使缓存失效
```

### 2.2 Redis缓存层

**缓存键设计**：

```
spark:dsl:{dslId}:page:{pageId}      → 页面HTML
spark:dsl:{dslId}:router             → 路由配置（文档级）
spark:dsl:{dslId}:component:{name}   → 组件代码
spark:dsl:{dslId}:meta               → DSL元数据
```

**缓存策略**：

| 缓存项 | TTL | 失效时机 | 粒度 |
|-------|-----|---------|-----|
| 页面HTML | 1小时 | 页面更新时 | 页面级 |
| 路由配置 | 1小时 | DSL更新时 | 文档级 |
| 组件代码 | 1小时 | DSL更新时 | 组件级 |
| DSL元数据 | 1小时 | DSL更新时 | 文档级 |

**增量更新示例**：

```typescript
// 只更新about页面
PUT /api/dsl/my-app/pages/about
{
  "data": { "title": "关于我们（新版）" }
}

// 缓存失效逻辑
await cache.invalidatePage('my-app', 'about');
// ✅ about页面缓存失效
// ✅ home、contact等其他页面缓存继续有效
```

### 2.3 Hybrid Client（混合客户端）

**核心功能**：

```typescript
// 1. 获取SSR内容
const renderData = await fetch(
  `/api/render?dslId=${dslId}&path=${path}`
).then(r => r.json());

// 2. 创建路由器
const router = createRouter({
  history: createWebHistory(),
  routes: eval(renderData.routerConfig) // 动态路由配置
});

// 3. 配置懒加载
routes.forEach(route => {
  route.component = () => loadComponent(route.pageId);
});

// 4. Hydration
const app = createApp(RootComponent);
app.use(router);
app.mount('#app'); // 接管SSR内容

// 5. 懒加载组件
async function loadComponent(name: string) {
  const url = renderData.lazyComponents[name];
  const code = await fetch(url).then(r => r.text());
  return eval(code); // 动态加载组件
}
```

## 3. 关键技术实现

### 3.1 SSR按需编译

**单页面模式**：
```typescript
// 编译整个DSL
const ast = parser.parse(dslContent);
const output = compiler.compile(ast);
```

**多页面模式（按需）**：
```typescript
// 只编译当前访问的页面
const ast = parser.parse(dslContent);
const targetPage = matchRoute(ast.routes, currentPath);
const html = await renderer.render(ast, { 
  routePath: currentPath,
  page: targetPage  // 只渲染这一个页面
});
```

### 3.2 路由配置生成

**DSL定义**：
```yaml
routes:
  - path: /
    name: home
    pageId: home
    meta:
      title: "首页"
  
  - path: /about
    name: about
    pageId: about
    meta:
      title: "关于"
      requiresAuth: true
```

**生成的Vue Router代码**：
```javascript
export default [
  {
    path: '/',
    name: 'home',
    component: () => loadComponent('home'),
    meta: { title: '首页' }
  },
  {
    path: '/about',
    name: 'about',
    component: () => loadComponent('about'),
    meta: { title: '关于', requiresAuth: true }
  }
]
```

### 3.3 Hydration（水合）过程

**服务端渲染**：
```html
<!-- SSR输出 -->
<div id="app">
  <h1>{{ welcomeText }}</h1>
  <p>当前时间: {{ currentTime }}</p>
</div>
```

**客户端接管**：
```typescript
// 1. 创建相同的Vue实例
const app = createApp({
  data() {
    return {
      welcomeText: '欢迎',
      currentTime: '2026-01-03'
    };
  }
});

// 2. mount()时Vue会识别已有的DOM
app.mount('#app');

// 3. Vue接管后，数据变化会正常响应
setTimeout(() => {
  app.welcomeText = '你好'; // DOM会更新
}, 1000);
```

## 4. 性能优化

### 4.1 缓存命中率优化

**策略**：
1. **预热缓存**：部署后主动访问常用页面
2. **长TTL**：不常更新的页面设置更长缓存时间
3. **缓存预加载**：根据访问模式预加载相关页面
4. **CDN边缘缓存**：静态资源CDN + 动态内容Redis

**监控指标**：
```typescript
{
  cacheHitRate: 85.3%,     // 缓存命中率
  avgResponseTime: 45ms,   // 平均响应时间
  p99ResponseTime: 120ms,  // 99分位响应时间
  compilationTime: 25ms    // 平均编译时间
}
```

### 4.2 懒加载策略

**关键路由预加载**：
```typescript
// 预加载前3个组件
const criticalComponents = ['home', 'about', 'contact'];
await Promise.all(
  criticalComponents.map(name => loadComponent(name))
);
```

**按需加载**：
```typescript
router.beforeEach(async (to, from, next) => {
  if (!isComponentLoaded(to.name)) {
    await loadComponent(to.name);
  }
  next();
});
```

### 4.3 Code Splitting

**页面级分割**：
```javascript
// 每个页面独立打包
const Home = () => import('./views/Home.vue');
const About = () => import('./views/About.vue');
```

**组件级分割**：
```javascript
// 大型组件按需加载
const HeavyChart = defineAsyncComponent(() =>
  import('./components/HeavyChart.vue')
);
```

## 5. 部署架构

### 5.1 单服务器部署

```
┌───────────────────────┐
│  Nginx (反向代理)      │
│  - 静态资源            │
│  - /api/* → Node       │
└──────┬────────────────┘
       │
       ↓
┌───────────────────────┐
│  Node.js (API Server) │
│  - Express            │
│  - SSR渲染            │
└──────┬────────────────┘
       │
       ↓
┌───────────────────────┐
│  Redis (本地)         │
│  - 页面缓存           │
└───────────────────────┘
```

### 5.2 集群部署（推荐）

```
         ┌──────────┐
         │  用户     │
         └─────┬────┘
               │
         ┌─────▼─────┐
         │  负载均衡  │
         └─────┬─────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐  ┌──▼───┐  ┌──▼───┐
│Nginx 1│  │Nginx 2│  │Nginx 3│
└───┬───┘  └──┬───┘  └──┬───┘
    │         │         │
    └─────────┼─────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼───┐  ┌──▼───┐  ┌──▼───┐
│ API 1 │  │ API 2 │  │ API 3 │
└───┬───┘  └──┬───┘  └──┬───┘
    │         │         │
    └─────────┼─────────┘
              │
        ┌─────▼─────┐
        │Redis集群  │
        │  (共享)   │
        └─────┬─────┘
              │
        ┌─────▼─────┐
        │  MongoDB  │
        │(DSL存储)  │
        └───────────┘
```

**特点**：
- ✅ 水平扩展：增加API服务器提升并发
- ✅ 高可用：单点故障不影响服务
- ✅ 缓存共享：所有实例共享Redis
- ✅ 数据一致：MongoDB持久化DSL

### 5.3 Docker Compose示例

```yaml
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - api-server

  api-server:
    build: ./packages/api-server
    environment:
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      - redis
      - mongodb
    deploy:
      replicas: 3

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  mongodb:
    image: mongo:7
    volumes:
      - mongo-data:/data/db

volumes:
  redis-data:
  mongo-data:
```

## 6. 使用示例

### 6.1 启动API Server

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:api

# 生产构建
pnpm build
pnpm --filter @spark-view/api-server start
```

### 6.2 上传DSL

```bash
curl -X POST http://localhost:3000/api/dsl \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-app",
    "dsl": {
      "dslVersion": "1.0.0",
      "pages": [...],
      "routes": [...]
    }
  }'
```

### 6.3 访问页面

```bash
# SSR渲染
curl "http://localhost:3000/api/render?dslId=my-app&path=/about"

# 响应包含：
# - html: SSR首屏
# - routerConfig: 路由配置
# - lazyComponents: 懒加载URL
```

### 6.4 更新单页面

```bash
curl -X PUT http://localhost:3000/api/dsl/my-app/pages/about \
  -H "Content-Type: application/json" \
  -d '{
    "data": { "title": "关于我们（更新）" }
  }'

# 结果：
# ✅ about页面缓存失效
# ✅ 其他页面缓存继续有效
```

## 7. 最佳实践

### 7.1 缓存策略

1. **设置合理的TTL**
   - 常更新的页面：5-15分钟
   - 不常更新的页面：1-24小时
   - 静态内容：长期缓存

2. **主动失效**
   - 更新DSL时立即失效相关缓存
   - 使用版本号控制缓存更新

3. **缓存预热**
   - 部署后自动访问热门页面
   - 定时刷新缓存

### 7.2 性能监控

```typescript
// 添加监控中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log({
      path: req.path,
      method: req.method,
      status: res.statusCode,
      duration,
      cacheHit: res.locals.cacheHit
    });
  });
  next();
});
```

### 7.3 错误处理

```typescript
try {
  const renderData = await fetch('/api/render?...');
  // 渲染内容
} catch (error) {
  // 降级方案：显示静态页面
  showFallbackPage();
  
  // 上报错误
  reportError(error);
}
```

## 8. 常见问题

### Q1: 缓存什么时候失效？

**A:** 
- 自动失效：TTL到期
- 手动失效：调用失效API
- 更新失效：PUT请求更新时

### Q2: 如何处理用户状态？

**A:**
```typescript
// 方案1：在initialData中传递
initialData: {
  user: { id: 123, name: 'Alice' },
  ...
}

// 方案2：客户端从cookie/localStorage读取
const user = JSON.parse(localStorage.getItem('user'));
```

### Q3: 懒加载失败怎么办？

**A:**
```typescript
async function loadComponent(name) {
  try {
    const code = await fetch(url).then(r => r.text());
    return eval(code);
  } catch (error) {
    // 降级：返回简单组件
    return {
      template: `<div>加载失败，请刷新</div>`
    };
  }
}
```

## 9. 总结

混合架构完美结合了SSR和SPA的优势：

**性能提升**：
- ⚡ SSR首屏 TTFB < 100ms
- ⚡ SPA导航切换 < 50ms
- ⚡ 缓存命中率 > 80%

**开发体验**：
- 🛠️ 按需编译，开发效率高
- 🛠️ 页面级缓存，部署成本低
- 🛠️ 增量更新，维护简单

**用户体验**：
- 🎯 快速首屏，无白屏
- 🎯 流畅导航，无刷新
- 🎯 SEO友好，易被收录

---

**相关文章**：
- [第十篇：路由系统与SPA架构](./10-router-spa-architecture.md)
- [第六篇：缓存策略](./06-cache-strategy.md)
- [第四篇：DSL驱动的SSR](./04-dsl-driven-ssr.md)
