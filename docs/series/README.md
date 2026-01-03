# 第二篇：DSL 编译链 - Lexer → AST → IR

## 摘要
深入解析 DSL 编译链的实现细节，从词法分析到抽象语法树，再到中间表示的完整流程。

## 核心内容
1. **Lexer 实现**: Token 定义、词法规则、错误处理
2. **Parser 实现**: 递归下降解析、表达式解析、AST 生成
3. **IR Generator**: AST 简化、优化机会、类型推导
4. **测试策略**: 快照测试、边界用例、性能基准

## 关键代码
详见 `packages/dsl-parser/src/parser.ts` 和 `packages/dsl-compiler/src/ir-generator.ts`

---

# 第三篇：Vue SSR 原理与工程实践

## 摘要
解析 Vue 3 SSR 核心原理，对比 renderToString 与 renderToNodeStream，探讨工程化实践。

## 核心内容
1. **Vue SSR 原理**: Virtual DOM 序列化、组件生命周期
2. **流式渲染**: renderToNodeStream 优势与限制
3. **性能优化**: 预渲染、组件缓存、Critical CSS
4. **同构挑战**: 状态管理、路由同步、API 调用

## 性能对比
| 方法 | TTFB | 内存占用 | 适用场景 |
|-----|------|---------|---------|
| renderToString | 50ms | 高 | 小页面 |
| renderToNodeStream | 10ms | 低 | 大页面 |

---

# 第六篇：组件分级与按需打包

## 摘要
介绍如何通过 Vite 实现智能代码分割，按水合策略打包组件，优化加载性能。

## 核心内容
1. **分包策略**: immediate/idle/visible 分组
2. **Vite 配置**: manualChunks、rollupOptions
3. **预加载**: link preload/prefetch
4. **动态导入**: 懒加载最佳实践

---

# 第七篇：边缘部署与缓存回源策略

## 摘要
探讨如何通过 CDN 边缘节点部署 SSR 服务，实现全球低延迟访问。

---

# 第十一篇：混合架构 - SSR首屏 + SPA导航

## 摘要
深入解析SPARK VIEW的双架构设计：**运行时架构**（SSR + SPA混合）和**编译时架构**（纯SPA静态构建），实现快速首屏和灵活部署的完美平衡。

## 核心内容

### 1. 双架构模式
- **运行时架构**: SSR首屏 + SPA导航，动态编译，实时更新
- **编译时架构**: 纯SPA静态构建，CDN部署，无后端依赖
- **架构选择**: 根据业务场景选择合适的方案

### 2. 运行时架构特性
- ⚡ SSR首屏 TTFB < 100ms
- ⚡ SPA导航切换 < 50ms
- ⚡ Redis缓存命中率 > 80%
- ⚡ 协商缓存减少 95% 传输量
- 🔧 页面级增量更新
- 🔧 支持水平扩展

### 3. 编译时架构特性
- 📦 单HTML入口（index.html）
- 📦 所有组件预编译（app.js）
- 📦 CSS按pageId容器隔离
- 📦 纯静态文件，CDN友好
- 🚀 部署简单，无需Node.js/Redis

### 4. 协商缓存机制
```typescript
// 时间戳管理
spark:dsl:{id}:page:{pageId}:ts   // 页面时间戳
spark:dsl:{id}:router:ts          // 路由时间戳

// 304响应（节省95%传输）
GET /api/render?path=/about&timestamp=1642394821000
Response: 304 Not Modified
```

### 5. 样式隔离策略
```css
/* pageId容器隔离 */
.page-home h1 { color: blue; }
.page-about h1 { color: green; }
.page-container { padding: 20px; } /* 全局 */
```

### 6. Mock模式
- 前端独立开发，无需后端
- Mock DSL + Mock编译器
- 支持协商缓存模拟

## API接口
```bash
# 运行时架构
GET  /api/render?dslId=xxx&path=/about&timestamp=xxx  # SSR渲染（协商缓存）
POST /api/dsl                                         # 保存DSL
GET  /api/dsl/:id                                     # 获取DSL
PUT  /api/dsl/:id/pages/:pageId                       # 更新单页面
POST /api/cache/invalidate/:dslId                     # 失效缓存

# 编译时架构
npx spark-build build -i dsl.json -o dist             # 构建静态文件
npx spark-build serve -d dist -p 8080                 # 预览构建结果
```

## 部署方案

### 运行时架构
- Nginx + Node.js + Redis
- Docker Compose 集群部署
- 支持水平扩展

### 编译时架构
- Nginx 静态服务器
- Vercel / Netlify
- AWS S3 + CloudFront
- Docker 静态镜像

## 相关文档
- [协商缓存机制详解](../cache-negotiation.md)
- [运行时 vs 编译时架构对比](../runtime-vs-buildtime.md)
- [完整文档](./11-hybrid-ssr-spa.md)

---

# 第七篇：边缘部署与缓存回源策略（待完善）

## 摘要
探讨如何将 SSR 服务部署到边缘节点（Cloudflare Workers、Vercel Edge），实现全球低延迟访问。

## 核心内容
1. **边缘架构**: CDN + Edge Functions + Origin
2. **Cloudflare Workers**: 部署示例、限制与优化
3. **缓存策略**: Stale-While-Revalidate、Cache Tags
4. **回源机制**: 缓存失效、热点预热

---

# 第八篇：智能编译与运行时裁剪

## 摘要
介绍 AI 驱动的编译优化与运行时裁剪，包括未使用代码消除、表达式预计算等。

## 核心内容
1. **静态分析**: 未使用组件检测、Dead Code Elimination
2. **预计算**: 编译时表达式求值
3. **AI 优化**: 使用 GPT 生成优化建议
4. **运行时裁剪**: 按设备类型加载不同 bundle

---

# 第九篇：监控、回滚与演进路线

## 摘要
构建完整的监控体系，设计回滚机制，展望 SPARK.View 的未来演进方向。

## 核心内容
1. **性能监控**: TTFB、LCP、Hydration Cost
2. **错误追踪**: Sentry 集成、Error Boundary
3. **回滚策略**: DSL 版本管理、灰度发布
4. **演进路线**: 可视化编辑器、多端适配、国际化

## 监控面板示例
```typescript
// 性能指标上报
window.addEventListener('load', () => {
  const perfData = performance.getEntriesByType('navigation')[0];
  analytics.track('page_load', {
    ttfb: perfData.responseStart,
    lcp: getLCP(),
    hydration: getHydrationTime(),
  });
});
```

---

# 第十篇：路由系统与 SPA 架构

## 摘要
详细介绍 SPARK VIEW 路由系统的设计与实现，支持声明式路由配置、自动代码生成和 SSR 路由渲染。

## 核心内容
1. **DSL 路由语法**: RouteConfig、NavigationConfig、RouterConfig 类型定义
2. **路由验证**: 路径格式检查、页面引用验证、嵌套路由支持
3. **代码生成**: RouterGenerator 自动生成 Vue Router 配置
4. **IR 扩展**: 路由和导航相关的中间表示节点
5. **SSR 路由**: 基于路径的页面匹配和渲染
6. **测试覆盖**: 16 个测试用例验证路由功能

## 路由配置示例
```yaml
routes:
  - path: /
    name: home
    pageId: home
    meta:
      title: 首页

  - path: /user/:id
    name: user-detail
    pageId: user-detail
    meta:
      requiresAuth: true

navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /
      - label: 产品
        path: /products
        children:
          - label: 服务A
            path: /products/a
```

---

**所有文章完整版本请查看**: `docs/series/` 目录
---

# 补充技术文档

## 协商缓存机制详解 (`docs/cache-negotiation.md`)

深入解析 HTTP 协商缓存在 SPARK VIEW 中的应用，实现客户端与服务端的高效缓存协商。

### 核心内容
1. **时间戳管理**: 页面级和路由级时间戳
2. **304响应**: Not Modified，节省95%传输量
3. **客户端缓存**: Map存储 + 时间戳验证
4. **缓存失效**: 自动失效与手动失效
5. **强刷支持**: Ctrl+F5 强制更新

### 性能提升
- 减少 95% 数据传输
- 客户端缓存命中率 > 90%
- 平均响应时间 < 10ms（304）

---

## 运行时 vs 编译时架构对比 (`docs/runtime-vs-buildtime.md`)

详细对比 SPARK VIEW 的两种架构模式，帮助开发者选择最适合的方案。

### 对比维度
1. **性能指标**: 首屏时间、导航速度、文件大小
2. **部署方式**: 服务器要求、CDN支持、运维成本
3. **更新机制**: 热更新 vs 重构建
4. **适用场景**: 内容频率、SEO需求、团队能力

### 推荐方案
| 场景 | 推荐架构 | 原因 |
|-----|---------|------|
| 新闻网站 | 运行时 | 内容频繁更新、需SEO |
| 官网 | 编译时 | 内容稳定、简化部署 |
| 后台管理 | 运行时 | 实时数据、个性化 |
| 文档站 | 编译时 | 静态内容、CDN加速 |

---