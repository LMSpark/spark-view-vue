# 第十一篇：混合架构 - SSR首屏 + SPA导航

## 摘要

深入解析SPARK VIEW的混合架构设计，实现SSR快速首屏和SPA流畅导航的完美结合，同时支持按需编译和页面级缓存。本文还介绍了编译时静态构建方案，实现前端与DSL完全解耦。

## 1. 架构概述

SPARK VIEW 提供两种架构模式：

### 1.1 运行时架构（SSR + SPA 混合）

**适用场景**：
- 内容频繁更新
- 需要SEO优化
- 个性化内容
- 实时数据展示

**技术特点**：
- ✅ SSR快速首屏 + SEO友好
- ✅ SPA流畅导航 + 无刷新体验
- ✅ 按需编译 + 页面级缓存
- ✅ 增量更新 + 热更新DSL
- ⚠️ 需要后端服务（Node.js + Redis）

### 1.2 编译时架构（纯 SPA）

**适用场景**：
- 内容相对稳定
- 官网、文档站
- 追求极致性能
- 简化部署

**技术特点**：
- ✅ 前端完全独立，不依赖DSL
- ✅ 纯静态文件，CDN部署
- ✅ 样式按pageId容器隔离
- ✅ 所有组件编译时打包
- ⚠️ 更新需要重新构建

### 1.3 架构选择建议

| 需求 | 运行时架构 | 编译时架构 |
|-----|----------|----------|
| 首屏性能 | ⭐⭐⭐⭐⭐ (50ms) | ⭐⭐⭐ (125ms) |
| 后续导航 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| SEO | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 部署难度 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 更新速度 | ⭐⭐⭐⭐⭐ (热更新) | ⭐⭐ (重构建) |
| 运维成本 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 2. 运行时架构详解

### 2.1 架构流程图

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

### 2.2 Redis缓存层与协商缓存

**缓存键设计**：

```
spark:dsl:{dslId}:page:{pageId}      → 页面HTML
spark:dsl:{dslId}:page:{pageId}:ts   → 页面时间戳
spark:dsl:{dslId}:router             → 路由配置（文档级）
spark:dsl:{dslId}:router:ts          → 路由时间戳
spark:dsl:{dslId}:component:{name}   → 组件代码
spark:dsl:{dslId}:meta               → DSL元数据
```

**协商缓存流程**：

```typescript
// 1. 首次请求（200 OK）
GET /api/render?dslId=my-app&path=/about
Response:
{
  "html": "<div>...</div>",
  "pageTimestamp": "1642394821000",
  "routerTimestamp": "1642394800000"
}

// 2. 再次请求带时间戳（304 Not Modified）
GET /api/render?dslId=my-app&path=/about&timestamp=1642394821000
Response: 304 Not Modified  // 无body，节省95%传输

// 3. 内容更新后（200 OK with new timestamp）
PUT /api/dsl/my-app/pages/about { "data": { "title": "新版" } }
GET /api/render?dslId=my-app&path=/about&timestamp=1642394821000
Response:
{
  "html": "<div>新版...</div>",
  "pageTimestamp": "1642395000000",  // 新时间戳
  "routerTimestamp": "1642394800000"
}
```

**缓存策略**：

| 缓存项 | TTL | 失效时机 | 粒度 | 协商缓存 |
|-------|-----|---------|-----|---------|
| 页面HTML | 1小时 | 页面更新时 | 页面级 | ✅ 304 |
| 页面时间戳 | 1小时 | 页面更新时 | 页面级 | - |
| 路由配置 | 1小时 | DSL更新时 | 文档级 | ✅ 304 |
| 路由时间戳 | 1小时 | DSL更新时 | 文档级 | - |
| 组件代码 | 1小时 | DSL更新时 | 组件级 | - |
| DSL元数据 | 1小时 | DSL更新时 | 文档级 | - |

详见：[协商缓存机制文档](../cache-negotiation.md)

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
// 1. 客户端缓存与协商缓存
const clientCache = new Map<string, CacheEntry>();

async function fetchPage(dslId: string, path: string) {
  const cached = clientCache.get(path);
  
  // 带时间戳请求
  const url = `/api/render?dslId=${dslId}&path=${path}${
    cached ? `&timestamp=${cached.timestamp}` : ''
  }`;
  
  const response = await fetch(url);
  
  // 处理304响应
  if (response.status === 304) {
    console.log('✅ 使用客户端缓存（304）');
    return { ...cached.data, fromCache: true };
  }
  
  // 处理200响应
  const data = await response.json();
  clientCache.set(path, {
    data,
    timestamp: data.pageTimestamp
  });
  
  return data;
}

// 2. 获取SSR内容
const renderData = await fetchPage(dslId, path);

// 3. 创建路由器
const router = createRouter({
  history: createWebHistory(),
  routes: eval(renderData.routerConfig) // 动态路由配置
});

// 4. 配置懒加载
routes.forEach(route => {
  route.component = () => loadComponent(route.pageId);
});

// 5. Hydration
const app = createApp(RootComponent);
app.use(router);
app.mount('#app'); // 接管SSR内容

// 6. 懒加载组件
async function loadComponent(name: string) {
  const url = renderData.lazyComponents[name];
  const code = await fetch(url).then(r => r.text());
  return eval(code); // 动态加载组件
}
```

## 3. 编译时架构详解（纯 SPA）

### 3.1 静态构建器（Static Builder）

编译时架构借鉴 **C# Razor 模板引擎** 的工作方式：
- **编译时**：DSL → JS/CSS（预编译）
- **运行时**：前端加载 JS/CSS，完全不依赖 DSL

**构建命令**：

```bash
# 方式1：使用package.json脚本
pnpm build:static

# 方式2：使用CLI工具
npx spark-build build -i dsl.json -o dist
npx spark-build serve -d dist -p 8080  # 预览构建结果
```

**生成产物**：

```
dist/
  ├── index.html      # 单一HTML，空div#app（不预渲染）
  ├── app.js          # 所有组件预编译打包
  ├── router.js       # 路由配置
  └── app.css         # 样式（pageId隔离）
```

**核心代码**：

```typescript
// packages/dsl-compiler/src/static-builder.ts
export class StaticBuilder {
  async build(inputPath: string, outputPath: string) {
    // 1. 读取DSL
    const dsl = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    
    // 2. 生成index.html（无预渲染）
    const html = this.generateIndexHtml(dsl);
    
    // 3. 编译所有组件为app.js
    const appJs = this.generateAppJs(dsl);
    
    // 4. 生成路由配置router.js
    const routerJs = this.generateRouterJs(dsl);
    
    // 5. 生成样式app.css（pageId隔离）
    const css = this.generateCss(dsl);
    
    // 6. 写入文件
    fs.writeFileSync(path.join(outputPath, 'index.html'), html);
    fs.writeFileSync(path.join(outputPath, 'app.js'), appJs);
    fs.writeFileSync(path.join(outputPath, 'router.js'), routerJs);
    fs.writeFileSync(path.join(outputPath, 'app.css'), css);
  }
}
```

### 3.2 样式隔离策略

为避免不同页面样式冲突，采用 **pageId 容器隔离**：

**生成的组件模板**：

```typescript
// generateComponentCode() 生成的组件
{
  name: 'HomePage',
  template: `
    <div class="page-container page-home">
      <h1>首页标题</h1>
      <p>首页内容</p>
    </div>
  `,
  data() {
    return { /* ... */ };
  }
}
```

**生成的样式**：

```css
/* app.css - pageId作用域隔离 */

/* 首页样式 */
.page-home h1 {
  color: #2c3e50;
  font-size: 32px;
}

.page-home p {
  color: #666;
  line-height: 1.6;
}

/* 关于页样式 */
.page-about h1 {
  color: #42b983;
  font-size: 28px;
}

.page-about p {
  color: #333;
  font-weight: bold;
}

/* 联系页样式 */
.page-contact h1 {
  color: #e74c3c;
  font-size: 24px;
}

.page-contact form {
  max-width: 500px;
  margin: 0 auto;
}

/* 全局样式（所有页面共享） */
.page-container {
  padding: 20px;
  min-height: 100vh;
}
```

**隔离效果**：
- ✅ `.page-home h1` 只影响首页的 `<h1>`
- ✅ `.page-about h1` 只影响关于页的 `<h1>`
- ✅ 无需 CSS Modules 或 Vue Scoped CSS
- ✅ 支持全局样式（`.page-container`）
- ✅ 开发者体验好，无需特殊语法

### 3.3 纯 SPA 运行时

**index.html（无预渲染）**：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <!-- 空容器，客户端渲染 -->
  <div id="app"></div>
  
  <!-- 加载Vue + 路由 + 组件 -->
  <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

**app.js（纯客户端渲染）**：

```typescript
// 1. 所有组件都在编译时打包
const components = {
  'home': {
    template: '<div class="page-container page-home"><h1>首页</h1></div>',
    data() { return { /* ... */ }; }
  },
  'about': {
    template: '<div class="page-container page-about"><h1>关于</h1></div>',
    data() { return { /* ... */ }; }
  },
  'contact': {
    template: '<div class="page-container page-contact"><h1>联系</h1></div>',
    data() { return { /* ... */ }; }
  }
};

// 2. 路由配置也在编译时生成
const routes = [
  { path: '/', component: components.home },
  { path: '/about', component: components.about },
  { path: '/contact', component: components.contact }
];

// 3. 创建Vue应用（纯SPA）
const { createApp } = Vue;
const { createRouter, createWebHistory } = VueRouter;

const app = createApp({
  template: '<router-view />'
});

app.use(createRouter({
  history: createWebHistory(),
  routes
}));

app.mount('#app');
```

**优势与劣势**：

| 维度 | 优势 | 劣势 |
|-----|------|------|
| 部署 | ✅ 静态文件，任意CDN | ⚠️ 需要重新构建 |
| 性能 | ✅ 无后端延迟 | ⚠️ 首屏稍慢（~125ms） |
| SEO | ❌ 客户端渲染 | ⚠️ 需要预渲染或SSR |
| 运维 | ✅ 无需Node.js/Redis | ⚠️ 更新不灵活 |
| 开发 | ✅ 支持Vite HMR | - |

### 3.4 Mock 模式（开发测试）

为了方便前端开发和测试，支持 Mock 模式：

**Mock DSL 定义**：

```typescript
// HybridDemo.vue
const mockDSL = {
  version: '1.0',
  pages: [
    {
      id: 'home',
      path: '/',
      data: { title: '首页' },
      layout: { type: 'container' },
      style: { color: '#2c3e50' }
    },
    {
      id: 'about',
      path: '/about',
      data: { title: '关于我们' },
      layout: { type: 'container' },
      style: { color: '#42b983' }
    }
  ]
};

// Mock 编译器
function mockCompile(dsl: DSL): string {
  return dsl.pages.map(page => `
    <div class="page-container page-${page.id}">
      <h1>${page.data.title}</h1>
    </div>
  `).join('\n');
}
```

**Mock 模式特性**：
- ✅ 无需启动 API Server
- ✅ 前端独立开发
- ✅ 快速原型验证
- ✅ 支持协商缓存模拟

## 4. 关键技术实现（运行时架构）

### 4.1 SSR按需编译

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

## 5. 性能优化

### 5.1 缓存命中率优化（运行时架构）

**策略**：
1. **预热缓存**：部署后主动访问常用页面
2. **长TTL**：不常更新的页面设置更长缓存时间
3. **缓存预加载**：根据访问模式预加载相关页面
4. **CDN边缘缓存**：静态资源CDN + 动态内容Redis
5. **协商缓存**：304响应减少95%传输量

**监控指标**：
```typescript
{
  cacheHitRate: 85.3%,     // Redis缓存命中率
  negotiationRate: 92.1%,  // 304协商缓存命中率
  avgResponseTime: 45ms,   // 平均响应时间（缓存命中）
  p99ResponseTime: 120ms,  // 99分位响应时间
  compilationTime: 25ms    // 平均编译时间（缓存未命中）
}
```

### 5.2 编译时优化（静态构建）

**优化策略**：

```typescript
// 1. 代码压缩
build({
  minify: true,  // 压缩JS/CSS
  uglify: true   // 混淆代码
});

// 2. Tree Shaking（未使用的组件不打包）
const usedComponents = extractUsedComponents(dsl);
const appJs = generateAppJs(dsl, usedComponents);

// 3. Critical CSS（关键CSS内联）
const criticalCss = extractCriticalCss(dsl.pages[0]);
html = html.replace('</head>', `<style>${criticalCss}</style></head>`);

// 4. 资源预加载
<link rel="preload" href="/app.js" as="script">
<link rel="preload" href="/app.css" as="style">
```

**性能对比**：

| 指标 | 运行时架构 | 编译时架构 | 优化建议 |
|-----|----------|----------|---------|
| 首屏时间 | 50ms (SSR) | 125ms (CSR) | 编译时可用预渲染 |
| 后续导航 | 30ms (SPA) | 30ms (SPA) | 两者一致 |
| 文件大小 | 45KB | 120KB | Tree Shaking |
| 缓存效率 | 服务端+协商 | 浏览器缓存 | CDN加速 |
| 更新速度 | 即时（热更新）| 需重构建 | CI/CD自动化 |

### 5.3 懒加载策略

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

### 5.4 Code Splitting

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

## 6. 部署架构

### 6.1 运行时架构部署

#### 6.1.1 单服务器部署

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

#### 6.1.2 集群部署（推荐）

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

### 6.2 编译时架构部署

#### 6.2.1 静态文件部署

```bash
# 1. 构建静态文件
pnpm build:static
# 或
npx spark-build build -i dsl.json -o dist

# 2. 部署到任意静态服务器
dist/
  ├── index.html
  ├── app.js
  ├── router.js
  └── app.css
```

#### 6.2.2 部署选项

**方式1：Nginx静态服务器**

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/spark-app/dist;
    
    # SPA路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**方式2：CDN部署**

```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod --dir=dist

# AWS S3 + CloudFront
aws s3 sync dist/ s3://my-bucket/
aws cloudfront create-invalidation --distribution-id XXX --paths "/*"
```

**方式3：Docker静态服务器**

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**特点**：
- ✅ 极简部署：无需Node.js/Redis/MongoDB
- ✅ 全球CDN：边缘节点加速
- ✅ 低成本：静态托管免费或低价
- ✅ 高可用：CDN天然高可用
- ⚠️ 更新慢：需要重新构建+部署

### 6.3 Docker Compose示例（运行时架构）

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

## 7. 使用示例

### 7.1 运行时架构：启动API Server

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:api

# 生产构建
pnpm build
pnpm --filter @spark-view/api-server start
```

### 7.2 上传DSL（运行时架构）

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

### 7.3 访问页面（运行时架构）

```bash
# SSR渲染（首次请求）
curl "http://localhost:3000/api/render?dslId=my-app&path=/about"

# 响应包含：
# - html: SSR首屏
# - routerConfig: 路由配置
# - lazyComponents: 懒加载URL
# - pageTimestamp: 页面时间戳
# - routerTimestamp: 路由时间戳

# 协商缓存（后续请求）
curl "http://localhost:3000/api/render?dslId=my-app&path=/about&timestamp=1642394821000"
# 响应：304 Not Modified（内容未变）
```

### 7.4 静态构建（编译时架构）

```bash
# 方式1：使用pnpm脚本
pnpm build:static

# 方式2：使用CLI工具
npx spark-build build \
  -i examples/my-app.json \
  -o dist \
  --minify \
  --base-url https://cdn.example.com

# 预览构建结果
npx spark-build serve -d dist -p 8080
# 访问：http://localhost:8080
```

### 7.5 混合模式演示（Demo Site）

```bash
# 启动Demo Site
pnpm dev:demo

# 访问 http://localhost:5174/hybrid
# 功能：
# - Mock模式开关（无需后端）
# - 协商缓存演示（304响应）
# - 客户端缓存可视化
# - 快速切换页面测试
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

## 8. 最佳实践

### 8.1 架构选择策略

**选择运行时架构**（SSR + SPA）：
- ✅ 内容需要频繁更新
- ✅ 需要SEO优化
- ✅ 追求极致首屏性能（50ms）
- ✅ 有运维团队支持
- ⚠️ 需要Node.js + Redis环境

**选择编译时架构**（纯 SPA）：
- ✅ 内容相对稳定（如官网、文档站）
- ✅ 追求简化部署（只需静态服务器）
- ✅ 全球CDN加速
- ✅ 降低运维成本
- ⚠️ 更新需要重新构建

**混合方案**（推荐）：
- 📱 营销页、落地页：编译时静态构建（SEO + CDN）
- 🔒 后台管理、个人中心：运行时动态渲染（实时数据）
- 📄 博客列表页：编译时预渲染
- 📝 博客详情页：运行时SSR（最新评论）

### 8.2 缓存策略

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

4. **协商缓存**
   - 客户端带时间戳请求
   - 服务端返回304（节省95%传输）

### 8.3 样式隔离

**使用pageId容器**：
```vue
<!-- 组件模板 -->
<div class="page-container page-{{ pageId }}">
  <h1>标题</h1>
</div>

<!-- 样式 -->
<style>
.page-home h1 { color: blue; }
.page-about h1 { color: green; }
</style>
```

**优势**：
- ✅ 简单易懂，无需特殊语法
- ✅ 支持全局样式（`.page-container`）
- ✅ 无需CSS Modules或Scoped CSS
- ✅ 方便调试和覆盖样式

### 8.4 性能监控

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
      cacheHit: res.locals.cacheHit,
      cacheSource: res.locals.cacheSource // 'redis' | 'negotiation'
    });
  });
  next();
});
```

### 8.5 错误处理

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

## 9. 常见问题

### Q1: 运行时架构和编译时架构如何选择？

**A:** 
- **运行时架构**：适合内容频繁更新、需要SEO、追求极致首屏性能的场景
- **编译时架构**：适合内容稳定、简化部署、降低运维成本的场景
- **混合方案**：营销页用静态构建，后台管理用动态渲染

详见：[运行时 vs 编译时架构对比](../runtime-vs-buildtime.md)

### Q2: 缓存什么时候失效？

**A:** 
- 自动失效：TTL到期
- 手动失效：调用失效API
- 更新失效：PUT请求更新时
- 协商缓存：服务端比对时间戳

### Q3: 如何处理用户状态？

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

### Q4: 懒加载失败怎么办？

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

### Q5: 样式冲突如何避免？

**A:**
使用pageId容器隔离：
```css
/* 首页样式只影响首页 */
.page-home h1 { color: blue; }

/* 关于页样式只影响关于页 */
.page-about h1 { color: green; }

/* 全局样式 */
.page-container { padding: 20px; }
```

### Q6: 如何实现Mock模式？

**A:**
```typescript
// 1. 定义Mock DSL
const mockDSL = {
  pages: [
    { id: 'home', path: '/', data: { title: '首页' } }
  ]
};

// 2. Mock编译器
function mockCompile(dsl) {
  return `<div class="page-container page-${dsl.id}">...</div>`;
}

// 3. 开关控制
if (useMockMode) {
  renderData = mockCompile(mockDSL);
} else {
  renderData = await fetch('/api/render?...');
}
```

## 10. 总结

SPARK VIEW 提供两种架构模式，适应不同业务场景：

### 运行时架构（SSR + SPA 混合）

**性能指标**：
- ⚡ SSR首屏 TTFB < 100ms
- ⚡ SPA导航切换 < 50ms
- ⚡ 缓存命中率 > 80%
- ⚡ 协商缓存减少 95% 传输

**适用场景**：
- 🎯 内容频繁更新（新闻、社交）
- 🎯 需要SEO优化
- 🎯 追求极致性能
- 🎯 个性化推荐

### 编译时架构（纯 SPA）

**性能指标**：
- ⚡ 首屏时间 ~125ms（可预渲染优化）
- ⚡ 导航切换 < 30ms
- ⚡ 资源大小 ~120KB（可Tree Shaking）
- ⚡ CDN加速全球访问

**适用场景**：
- 📄 官网、文档站
- 📱 营销落地页
- 🎨 作品展示站
- 🔧 工具类应用

### 技术亮点

**协商缓存机制**：
- 客户端Map缓存 + 时间戳
- 304响应无body，节省95%传输
- 支持强刷（Ctrl+F5）

**样式隔离策略**：
- pageId容器作用域（`.page-{id}`）
- 无需CSS Modules或Scoped CSS
- 支持全局+局部样式

**Mock模式**：
- 前端独立开发
- 无需启动后端
- 快速原型验证

---

**相关文档**：
- [运行时 vs 编译时架构对比](../runtime-vs-buildtime.md)
- [协商缓存机制详解](../cache-negotiation.md)
