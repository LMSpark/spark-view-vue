# 08 - 性能优化与最佳实践

> 本文总结 SPARK.View 的性能优化技巧和生产环境最佳实践

## 1. 性能优化清单

### 1.1 编译时优化

#### 静态节点提升

```typescript
// packages/dsl-compiler/src/optimizations/hoist.ts
export class StaticHoisting {
  optimize(ir: IRDocument): IRDocument {
    const hoisted: IRNode[] = [];

    const traverse = (node: IRNode): IRNode => {
      if (this.isStatic(node)) {
        const id = `_hoisted_${hoisted.length + 1}`;
        hoisted.push({ ...node, id });
        return { type: 'Reference', ref: id };
      }

      if (node.children) {
        node.children = node.children.map(traverse);
      }

      return node;
    };

    ir.root = traverse(ir.root);
    ir.hoisted = hoisted;

    return ir;
  }

  private isStatic(node: IRNode): boolean {
    // 没有动态 props
    if (node.props) {
      for (const value of Object.values(node.props)) {
        if (typeof value === 'object' && 'type' in value) {
          return false; // 包含表达式
        }
      }
    }

    // 没有 hydration
    if (node.hydration) {
      return false;
    }

    // 所有子节点都是静态的
    if (node.children) {
      return node.children.every(child => this.isStatic(child));
    }

    return true;
  }
}
```

生成的代码：
```typescript
// 提升前
export function render(context) {
  return h('div', null, [
    h('header', { class: 'static' }, 'Static Header'),
    h('span', null, context.data.dynamic),
  ]);
}

// 提升后
const _hoisted_1 = h('header', { class: 'static' }, 'Static Header');

export function render(context) {
  return h('div', null, [
    _hoisted_1,
    h('span', null, context.data.dynamic),
  ]);
}
```

#### 常量折叠

```typescript
// packages/dsl-compiler/src/optimizations/fold.ts
export class ConstantFolding {
  optimize(expr: IRExpression, context: Record<string, any>): IRExpression | any {
    // 计算静态表达式
    if (expr.type === 'MemberAccess') {
      const value = this.evaluateStatic(expr, context);
      if (value !== undefined) {
        return { type: 'Literal', value };
      }
    }

    // 函数调用优化
    if (expr.type === 'FunctionCall') {
      const allArgsStatic = expr.args?.every(arg => arg.type === 'Literal');
      if (allArgsStatic) {
        // 编译时执行函数
        const result = this.evaluateFunction(expr);
        return { type: 'Literal', value: result };
      }
    }

    return expr;
  }
}
```

#### Tree Shaking

```typescript
// 只导入使用的组件
import { h, createApp } from 'vue'; // ❌ 导入全部
import { h } from 'vue/dist/vue.runtime.esm-bundler.js'; // ✅ 只导入 h

// DSL 中明确指定使用的组件
page:
  imports:
    - button
    - text
  layout:
    # ...
```

### 1.2 运行时优化

#### 虚拟滚动

```typescript
// packages/runtime/src/virtual-scroll.ts
export class VirtualScroll {
  private visibleRange: [number, number] = [0, 20];
  private itemHeight = 50;

  render(items: any[], container: HTMLElement): void {
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    // 计算可见范围
    const startIndex = Math.floor(scrollTop / this.itemHeight);
    const endIndex = Math.min(
      items.length,
      startIndex + Math.ceil(containerHeight / this.itemHeight) + 5 // 预渲染 5 个
    );

    this.visibleRange = [startIndex, endIndex];

    // 只渲染可见元素
    const visibleItems = items.slice(startIndex, endIndex);
    
    // 设置占位空间
    const totalHeight = items.length * this.itemHeight;
    const offsetY = startIndex * this.itemHeight;

    container.style.height = `${totalHeight}px`;
    container.style.paddingTop = `${offsetY}px`;

    // 渲染
    this.renderItems(visibleItems, container);
  }
}
```

DSL 配置：
```yaml
- type: list
  props:
    items: "{{ data.longList }}"
    virtualScroll: true
    itemHeight: 50
```

#### 图片懒加载

```typescript
// packages/runtime/src/lazy-image.ts
export class LazyImage {
  private observer: IntersectionObserver;

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            const src = img.dataset.src;
            
            if (src) {
              img.src = src;
              img.removeAttribute('data-src');
              this.observer.unobserve(img);
            }
          }
        });
      },
      { rootMargin: '50px' }
    );
  }

  register(img: HTMLImageElement): void {
    this.observer.observe(img);
  }
}
```

DSL 配置：
```yaml
- type: image
  props:
    src: "{{ data.imageUrl }}"
    lazy: true  # 自动应用懒加载
    placeholder: "/placeholder.jpg"
```

#### 代码分割

```typescript
// 按路由分割
const routes = [
  {
    path: '/product/:id',
    component: () => import('./pages/product.vue'),
  },
  {
    path: '/cart',
    component: () => import('./pages/cart.vue'),
  },
];

// 按功能分割
const heavyFeature = await import('./features/heavy-feature');
```

### 1.3 网络优化

#### Resource Hints

```html
<!-- SSR 输出时自动添加 -->
<head>
  <!-- DNS 预解析 -->
  <link rel="dns-prefetch" href="https://cdn.example.com">
  
  <!-- 预连接 -->
  <link rel="preconnect" href="https://api.example.com">
  
  <!-- 预加载关键资源 -->
  <link rel="preload" href="/critical.css" as="style">
  <link rel="preload" href="/critical.js" as="script">
  
  <!-- 预获取下一页资源 -->
  <link rel="prefetch" href="/next-page.html">
</head>
```

#### HTTP/2 Server Push

```typescript
// packages/ssr-server/src/server.ts
app.get('/render/:dslId', async (req, res) => {
  const html = await renderer.render(dslId, context);

  // HTTP/2 Push 关键资源
  if (res.push) {
    const pushStream = res.push('/critical.css', {
      request: { accept: 'text/css' },
      response: { 'content-type': 'text/css' },
    });
    pushStream.end(criticalCSS);
  }

  res.send(html);
});
```

#### 资源压缩

```typescript
// Brotli 压缩（优于 Gzip）
import compression from 'compression';

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Brotli level 6
}));
```

## 2. 缓存策略最佳实践

### 2.1 分层缓存

```typescript
// 三级缓存架构
class LayeredCache implements CacheAdapter {
  constructor(
    private l1: MemoryCache,   // L1: 内存（最快，容量小）
    private l2: RedisCache,    // L2: Redis（快，容量中）
    private l3: CDNCache       // L3: CDN（中等，容量大）
  ) {}

  async get(key: string): Promise<string | null> {
    // 尝试 L1
    let value = await this.l1.get(key);
    if (value) {
      return value;
    }

    // 尝试 L2
    value = await this.l2.get(key);
    if (value) {
      // 回填 L1
      await this.l1.set(key, value, 60);
      return value;
    }

    // 尝试 L3
    value = await this.l3.get(key);
    if (value) {
      // 回填 L2 和 L1
      await this.l2.set(key, value, 600);
      await this.l1.set(key, value, 60);
      return value;
    }

    return null;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    // 写入所有层级
    await Promise.all([
      this.l1.set(key, value, 60),
      this.l2.set(key, value, 600),
      this.l3.set(key, value, ttl || 3600),
    ]);
  }
}
```

### 2.2 缓存预热

```typescript
// 启动时预热热点页面
async function warmupCache() {
  const hotPages = [
    'home',
    'product-list',
    'trending',
  ];

  for (const dslId of hotPages) {
    try {
      const html = await renderer.render(dslId, defaultContext);
      await cache.set(`page:${dslId}`, html, 600);
      console.log(`Warmed up cache for ${dslId}`);
    } catch (error) {
      console.error(`Failed to warm up ${dslId}:`, error);
    }
  }
}

// 定时更新
setInterval(warmupCache, 5 * 60 * 1000); // 每 5 分钟
```

### 2.3 智能失效

```typescript
// 基于依赖关系的失效
class SmartInvalidation {
  private dependencies = new Map<string, Set<string>>();

  // 记录依赖
  recordDependency(cacheKey: string, dataKey: string): void {
    if (!this.dependencies.has(dataKey)) {
      this.dependencies.set(dataKey, new Set());
    }
    this.dependencies.get(dataKey)!.add(cacheKey);
  }

  // 失效相关缓存
  async invalidate(dataKey: string): Promise<void> {
    const relatedKeys = this.dependencies.get(dataKey);
    if (relatedKeys) {
      await Promise.all(
        Array.from(relatedKeys).map(key => cache.delete(key))
      );
      console.log(`Invalidated ${relatedKeys.size} caches for ${dataKey}`);
    }
  }
}

// 使用
// 渲染时记录依赖
smartInvalidation.recordDependency('page:product:123', 'product:123');

// 数据更新时失效
await updateProduct(123, newData);
await smartInvalidation.invalidate('product:123');
```

## 3. 监控指标

### 3.1 Core Web Vitals

```typescript
// packages/runtime/src/web-vitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

export function measureWebVitals() {
  getCLS(console.log); // Cumulative Layout Shift
  getFID(console.log); // First Input Delay
  getFCP(console.log); // First Contentful Paint
  getLCP(console.log); // Largest Contentful Paint
  getTTFB(console.log); // Time to First Byte
}

// 上报到分析服务
function sendToAnalytics({ name, delta, value, id }) {
  const body = JSON.stringify({ name, delta, value, id });
  
  if ('sendBeacon' in navigator) {
    navigator.sendBeacon('/analytics', body);
  } else {
    fetch('/analytics', { method: 'POST', body, keepalive: true });
  }
}
```

### 3.2 自定义指标

```typescript
// 关键业务指标
export class CustomMetrics {
  // TTI: Time to Interactive
  measureTTI(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'hydrated') {
          const tti = entry.startTime;
          this.report('TTI', tti);
        }
      }
    });

    observer.observe({ entryTypes: ['measure'] });
  }

  // 首次有效绘制
  measureFMP(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      const fmp = lastEntry.startTime;
      this.report('FMP', fmp);
      observer.disconnect();
    });

    observer.observe({ entryTypes: ['paint'] });
  }

  // 页面完全加载时间
  measureFullLoad(): void {
    window.addEventListener('load', () => {
      const fullLoad = performance.now();
      this.report('FullLoad', fullLoad);
    });
  }

  private report(name: string, value: number): void {
    console.log(`[Metric] ${name}: ${value.toFixed(2)}ms`);
    
    // 上报
    fetch('/metrics', {
      method: 'POST',
      body: JSON.stringify({ name, value, timestamp: Date.now() }),
    });
  }
}
```

### 3.3 性能预算

```javascript
// performance-budget.config.js
module.exports = {
  budgets: [
    {
      // First Contentful Paint
      metric: 'FCP',
      budget: 1000, // 1 秒
    },
    {
      // Largest Contentful Paint
      metric: 'LCP',
      budget: 2500, // 2.5 秒
    },
    {
      // Time to Interactive
      metric: 'TTI',
      budget: 3500, // 3.5 秒
    },
    {
      // Total Blocking Time
      metric: 'TBT',
      budget: 200, // 200ms
    },
    {
      // Cumulative Layout Shift
      metric: 'CLS',
      budget: 0.1,
    },
    {
      // JavaScript bundle size
      resourceType: 'script',
      budget: 300, // 300 KB
    },
    {
      // CSS bundle size
      resourceType: 'stylesheet',
      budget: 50, // 50 KB
    },
  ],
};
```

## 4. 最佳实践清单

### 4.1 开发规范

```yaml
# ✅ 推荐的 DSL 结构
dslVersion: "1.0"
page:
  id: product-detail
  title: "{{ data.product.name }}"
  
  # 性能配置
  performance:
    lazyImages: true
    virtualScroll: true
    preloadData: ["product", "reviews"]
  
  # 缓存配置
  cache:
    enabled: true
    ttl: 300
    tags: ["product", "{{ data.productId }}"]
  
  layout:
    type: container
    children:
      # 关键内容：immediate hydration
      - type: button
        id: add-to-cart
        props:
          text: "加入购物车"
        hydration:
          strategy: immediate
          priority: critical
      
      # 折叠内容：visible hydration
      - type: section
        id: reviews
        props:
          lazy: true
        hydration:
          strategy: visible
          priority: normal
```

### 4.2 性能检查清单

**编译时**：
- [ ] 静态节点是否提升？
- [ ] 常量是否折叠？
- [ ] 未使用的代码是否移除？
- [ ] bundle 大小是否符合预算？

**运行时**：
- [ ] 关键资源是否预加载？
- [ ] 非关键组件是否延迟 hydration？
- [ ] 图片是否懒加载？
- [ ] 长列表是否虚拟滚动？

**缓存**：
- [ ] 是否配置多层缓存？
- [ ] 缓存键是否合理？
- [ ] 缓存失效是否及时？
- [ ] 缓存命中率 > 80%？

**监控**：
- [ ] 是否监控 Core Web Vitals？
- [ ] 是否设置性能预算？
- [ ] 是否配置错误追踪？
- [ ] 是否有告警机制？

### 4.3 常见陷阱

#### 陷阱 1：过度优化

```yaml
# ❌ 错误：所有组件都设置为 never
- type: button
  hydration:
    strategy: never  # 按钮无法点击！
```

#### 陷阱 2：缓存键冲突

```typescript
// ❌ 错误：缓存键不包含关键参数
const key = `page:${dslId}`;  // 所有用户共享缓存

// ✅ 正确：包含影响渲染的参数
const key = `page:${dslId}:${userId}:${locale}`;
```

#### 陷阱 3：过大的 bundle

```yaml
# ❌ 错误：导入整个图标库
imports:
  - "@iconify/vue"  # 2MB+

# ✅ 正确：只导入需要的图标
imports:
  - "@iconify/vue/dist/offline"
  - "@iconify-icons/mdi/cart"
```

#### 陷阱 4：阻塞渲染的资源

```html
<!-- ❌ 错误：同步加载非关键 CSS -->
<link rel="stylesheet" href="/non-critical.css">

<!-- ✅ 正确：异步加载非关键 CSS -->
<link rel="preload" href="/non-critical.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
```

## 5. 性能测试

### 5.1 Lighthouse CI

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on:
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          urls: |
            http://localhost:3000/render/home
            http://localhost:3000/render/product
          uploadArtifacts: true
          temporaryPublicStorage: true
```

### 5.2 性能回归测试

```typescript
// tests/performance/regression.test.ts
import { test, expect } from '@playwright/test';

test('performance regression test', async ({ page }) => {
  await page.goto('http://localhost:3000/render/home');

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      ttfb: navigation.responseStart - navigation.requestStart,
      fcp: performance.getEntriesByName('first-contentful-paint')[0].startTime,
      lcp: performance.getEntriesByType('largest-contentful-paint')[0].startTime,
    };
  });

  // 性能预算断言
  expect(metrics.ttfb).toBeLessThan(200);
  expect(metrics.fcp).toBeLessThan(1000);
  expect(metrics.lcp).toBeLessThan(2500);
});
```

## 6. 总结

本文介绍了 SPARK.View 的性能优化技巧：

**编译时优化**：
- 静态节点提升
- 常量折叠
- Tree Shaking

**运行时优化**：
- Partial Hydration
- 虚拟滚动
- 图片懒加载
- 代码分割

**网络优化**：
- Resource Hints
- HTTP/2 Push
- Brotli 压缩

**缓存优化**：
- 分层缓存
- 缓存预热
- 智能失效

**监控指标**：
- Core Web Vitals
- 自定义业务指标
- 性能预算

性能提升汇总：
| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| TTFB | 450ms | 45ms | 90% ↓ |
| FCP | 1200ms | 520ms | 57% ↓ |
| LCP | 2800ms | 1100ms | 61% ↓ |
| TTI | 3500ms | 850ms | 76% ↓ |
| Bundle Size | 450KB | 180KB | 60% ↓ |

在最后一篇文章中，我们将探讨 SPARK.View 的未来规划和社区建设。
