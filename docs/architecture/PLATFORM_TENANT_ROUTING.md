# 平台 → 租户 → 项目 → 导航路由 架构文档

> 本文档梳理 SPARK 系统中平台、租户、项目、导航、路由之间的完整关系链。

## 1. 实体层级关系

```
平台 (SPARK Platform)
  └── 租户 (Tenant) ← X-Tenant-Id 隔离
        ├── 用户 (User) ← JWT 认证，tenantId claim
        └── 项目 (Project) ← X-Project-Id
              │
              ├── 🏠 企业主页 (homepage)             ← 系统保留，随租户自动创建，不可删除
              │     projectType="homepage", sortOrder=0
              │     登录后默认落地项目（defaultProjectId）
              │
              ├── 📦 业务应用 (app) × N               ← 用户自建，sortOrder=100
              │     projectType="app"
              │
              └── 每个项目独立拥有：
                    ├── 导航树 (NavigationConfig) ← 一棵 per project
                    ├── 页面配置 (PageConfig) ← rule.json / pagedata.json / script.js
                    └── 数据表 (TableSchema + TableRow) ← 通用 CRUD
```

### 1.1 平台 vs 租户

| 维度 | 平台 | 租户 |
|------|------|------|
| 访问路径 | `/`（公共首页） | `/t/{tenantId}/*` |
| 认证要求 | 无需登录 | 需要 JWT + X-Tenant-Id |
| 数据隔离 | 无数据 | 所有业务数据按 tenantId 隔离 |
| 路由 | 仅 `/` 和 `/login` | 所有 `/t/:tenantId/*` 下的路由 |

### 1.2 租户 vs 项目（企业主应用）

每个租户拥有 **1 个系统保留主应用 + N 个用户自建应用**，二者均以 `ProjectEntity` 建模：

| 项目类型 | projectType | projectId | sortOrder | 说明 |
|---------|-------------|-----------|-----------|------|
| **企业主页** | `"homepage"` | `"homepage"` | 0 | 随租户自动创建，**不可删除**，登录后默认落地 |
| **业务应用** | `"app"` | 自定义 ID | 100 | 用户按需创建的独立应用工作空间 |

> **「企业主应用」设计意图**：每个租户注册后即有一个开箱即用的工作空间（导航、页面、数据表），
> 无需先「创建项目」再「进入项目」。用户登录后 `defaultProjectId = "homepage"` 自动生效，
> 所有 API 请求（`X-Project-Id: homepage`）和路由（`/t/{tenantId}/*`）默认指向此项目。

**生命周期**：

```
注册租户
  → AuthController.registerTenant()
    → ProjectService.ensureHomepage(tenantId)   ← 幂等，已存在则跳过
      → INSERT ProjectEntity { projectId="homepage", projectType="homepage",
                                name="企业主页", icon="🏠", sortOrder=0 }

登录
  → JWT { tenantId, defaultProjectId: "homepage" }
  → 前端 getUser().defaultProjectId → api-paths.ts → 所有 API 自动路由到 homepage 项目

切换项目（未来）
  → 更新 defaultProjectId → API 路径自动切换到目标项目
```

**保护机制**：`ProjectService.deleteProject()` 遇到 `projectType == "homepage"` 抛异常，防止误删。

### 1.3 项目 vs 导航/路由

每个项目有独立的：
- **导航树**（NavigationConfig）：前端左侧/顶部导航菜单的数据源
- **页面配置**（PageConfig）：每个页面的 rule.json / pagedata.json / script.js
- **路由表**（routes.json）：`DynamicRouter` 加载并注册到 vue-router

## 2. 后端 API 结构

### 2.1 作用域 API（需要 tenantId + projectId）

```
/api/tenants/{tenantId}/projects/{projectId}/navigation     ← 导航 CRUD
/api/tenants/{tenantId}/projects/{projectId}/pages-config    ← 页面配置
/api/tenants/{tenantId}/projects/{projectId}/data            ← 数据表 CRUD
```

### 2.2 PageConfig 扁平兼容路由（从 Header 推断）

```
/api/pages-config/*   ← 从 X-Tenant-Id + X-Project-Id 请求头推断作用域
```

> **注意**：仅 PageConfigController 有扁平兼容路由。NavigationController 和 GenericTableController 必须在 URL 中显式传递 tenantId/projectId。

### 2.3 认证 API（无需租户上下文）

```
/api/auth/login              ← 登录
/api/auth/register           ← 注册用户
/api/auth/register-tenant    ← 注册新租户
/api/auth/me                 ← 当前用户信息
```

### 2.4 全局 API（无租户隔离）

```
/api/config/default          ← 默认应用配置
/api/tenants                 ← 租户列表
/api/events                  ← SSE 事件流
/api/ai/*                    ← AI 对话、元数据
/api/logs                    ← 日志上报
```

## 3. 前端租户上下文链路

### 3.1 登录 → 存储 → 注入

```
LoginView → auth.login({ tenantId, username, password })
  → 后端返回 JWT + AuthUser { tenantId, defaultProjectId }
  → saveAuth(token, user) → localStorage
  → 跳转 /t/{tenantId}/dashboard
```

### 3.2 API 请求头注入

`src/services/http.ts` 的请求拦截器自动注入：

```
Authorization:  Bearer {JWT}
X-Tenant-Id:    {user.tenantId}      ← 从 localStorage 读取
X-Project-Id:   {user.defaultProjectId}  ← 默认 "homepage"
```

### 3.3 路由体系

| 路由类型 | 路径模式 | 组件 | 注册方式 |
|---------|---------|------|---------|
| 公共路由 | `/`, `/login` | HomePage, LoginView | 静态声明 |
| 租户静态路由 | `/t/:tenantId/dashboard` 等 | Vue 组件 | staticRoutes 声明 |
| 租户配置路由 | `/t/:tenantId/{pageId}` | FCPageRenderer | DynamicRouter 从 routes.json 加载 |

### 3.4 路由守卫规则

```
1. 未登录 + 非公共路由 → /login
2. 已登录 + /login → /t/{tenantId}/dashboard
3. 已登录 + 旧扁平路径 → /t/{tenantId}{path}
```

## 4. 前端作用域 API 路径

`src/services/api-paths.ts` 提供动态函数，根据当前登录用户的 tenantId/projectId 生成作用域路径：

```typescript
getNavApi()   → /api/tenants/{tenantId}/projects/{projectId}/navigation
getPageApi()  → /api/tenants/{tenantId}/projects/{projectId}/pages-config
getDataApi()  → /api/tenants/{tenantId}/projects/{projectId}/data
```

> 所有管理界面（PageManager、NavModuleManager、SiteManager、DevWorkbench）通过这些函数获取正确的 API 路径。
> http.ts 拦截器额外注入 X-Tenant-Id/X-Project-Id 请求头（双重保险，URL + Header 一致）。

## 5. 数据流全景图

```
用户登录
  → JWT { tenantId: "lmspark", ... }
  → localStorage { spark_token, spark_user }
  → http.ts 拦截器自动注入 X-Tenant-Id / X-Project-Id

平台首页 (/)
  → 公共路由，无 API 调用
  → 点击"开始使用" → /login

租户首页 (/t/lmspark/dashboard)
  → App.vue onMounted → reloadNavigation()
    → GET /api/tenants/{tenantId}/projects/{projectId}/navigation
    → 渲染导航树

导航点击 → /t/lmspark/{pageId}
  → DynamicRouter 已注册 → FCPageRenderer
  → ConfigLoader.load({pageId})
    → GET /api/pages-config/{pageId}/rule.json      (扁平路由 + Header)
    → GET /api/pages-config/{pageId}/pagedata.json
    → GET /api/pages-config/{pageId}/script.js

管理界面
  → getPageApi() / getNavApi() / getDataApi()
  → 显式 URL 路径 + http.ts 自动 Header
```

## 6. 关键设计约束

1. **后端是单一数据源**：所有路由、导航、页面配置都存储在后端，前端通过 API 获取
2. **JWT tenantId 验证**：后端 JwtAuthFilter 检查 X-Tenant-Id 请求头与 JWT claim 一致
3. **homepage 不可删除**：每个租户的 homepage 项目由系统保证存在
4. **DynamicRouter 双通道**：vue-component 路由用预注册组件，config 路由用 PageRenderer
5. **ConfigLoader 走扁平路由**：`/api/pages-config/{pageId}/{file}`（依赖 Header 推断 tenant/project）
6. **管理 API 走显式路由**：`/api/tenants/{tid}/projects/{pid}/...`（URL 中包含完整作用域）
