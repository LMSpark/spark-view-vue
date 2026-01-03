# API Server

SPARK VIEW 的 API 服务器，实现 SSR 首屏 + SPA 导航的混合架构。

## 功能特性

- **SSR 按需渲染**: 首次访问返回服务端渲染的 HTML
- **SPA 路由**: 返回完整路由配置，后续导航无刷新
- **页面级缓存**: Redis 缓存单个页面，支持增量更新
- **DSL 管理**: 增删改查 DSL 文档，支持单页面更新
- **缓存失效**: 智能缓存失效策略

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 生产构建
pnpm build
pnpm start
```

## 环境变量

创建 `.env` 文件：

```env
PORT=3000
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600
```

## API 接口

### 1. SSR 渲染（混合架构核心）

```http
GET /api/render?dslId=xxx&path=/detail/123
```

**响应**:
```json
{
  "html": "<div>...</div>",           // SSR首屏HTML
  "routerConfig": "export default {}", // 完整路由配置
  "lazyComponents": {                  // 懒加载组件URL
    "list": "/api/component/xxx/list"
  },
  "initialData": {
    "currentPath": "/detail/123",
    "dslId": "xxx",
    "pageId": "detail"
  }
}
```

### 2. 保存 DSL

```http
POST /api/dsl
Content-Type: application/json

{
  "id": "my-dsl",
  "dsl": { "dslVersion": "1.0.0", ... }
}
```

### 3. 获取 DSL

```http
GET /api/dsl/:id
```

### 4. 更新单页面（增量更新）

```http
PUT /api/dsl/:id/pages/:pageId
Content-Type: application/json

{
  "data": { "title": "New Title", ... }
}
```

### 5. 删除 DSL

```http
DELETE /api/dsl/:id
```

### 6. 使缓存失效

```http
POST /api/cache/invalidate/:dslId
```

## 架构说明

### 混合架构工作流程

```
1. 首次访问 /detail/123
   ↓
2. GET /api/render?dslId=xxx&path=/detail/123
   ↓
3. 返回:
   - SSR渲染的HTML（快速首屏）
   - 完整路由配置（SPA导航用）
   - 懒加载组件URL（按需加载）
   ↓
4. 客户端Vue应用接管（Hydration）
   ↓
5. 点击导航 → 客户端路由切换（无刷新）
   ↓
6. 懒加载组件按需下载
```

### 缓存策略

```
Redis缓存结构：
- spark:dsl:{dslId}:page:{pageId}      → 页面HTML
- spark:dsl:{dslId}:router             → 路由配置
- spark:dsl:{dslId}:component:{name}   → 组件代码
- spark:dsl:{dslId}:meta               → DSL元数据
```

### 增量更新

更新单个页面时：
1. 只重新编译该页面
2. 只使该页面缓存失效
3. 其他页面缓存继续有效
4. 所有 nginx 实例共享 Redis，自动同步

## 生产部署

```
┌─────────────────┐
│  Nginx (多台)    │
│  - 静态资源      │
│  - /api/* 代理   │
└────────┬────────┘
         │
    ┌────▼────┐
    │ API集群  │
    │(Node.js)│
    └────┬────┘
         │
    ┌────▼────┐
    │  Redis  │
    │  缓存层  │
    └─────────┘
```
