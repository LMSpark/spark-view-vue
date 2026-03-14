# 平台 → 租户 → 项目 → 导航路由 架构文档

> 本文档梳理 SPARK 系统中平台、租户、项目、导航、路由之间的完整关系链。

## 1. 实体层级关系

```
平台 (SPARK Platform)
  └── 租户 (Tenant) ← X-Tenant-Id 隔离
        ├── 用户 (User) ← JWT 认证，tenantId claim
        └── 项目 (Project) ← X-Project-Id
              │
              ├── �️ 企业管理平台 (homepage)           ← 系统保留，随租户自动创建，不可删除
              │     projectType="homepage", sortOrder=0
              │     登录后默认落地项目（defaultProjectId）
              │     │
              │     ├── /dashboard — 管理仪表板（登录后落地页）
              │     ├── 📱 应用管理 — 创建 / 配置 / 删除业务应用
              │     ├── 🧭 导航管理 — 编辑当前项目导航树
              │     ├── 📄 页面管理 — 页面配置 CRUD
              │     ├── 🏗️ 站点管理 — 站点级别配置
              │     ├── ⚡ 开发工作台 — AI 页面生成 / 调试
              │     ├── 🗄️ 缓存管理 — 缓存策略与清理
              │     ├── ⚙️ 系统设置 — 租户级参数
              │     └── ... 用户通过 AI / 页面管理创建的配置页面
              │
              └── 📦 业务应用 (app) × N               ← 用户自建，sortOrder=100
                    projectType="app"
                    │
                    ├── 独立导航树
                    ├── 独立页面配置 (rule.json / pagedata.json / script.js)
                    └── 独立数据表 (TableSchema + TableRow)
```

### 1.1 平台 vs 租户

| 维度 | 平台 | 租户 |
|------|------|------|
| 访问路径 | `/`（公共首页） | `/t/{tenantId}/*` |
| 认证要求 | 无需登录 | 需要 JWT + X-Tenant-Id |
| 数据隔离 | 无数据 | 所有业务数据按 tenantId 隔离 |
| 路由 | 仅 `/` 和 `/login` | 所有 `/t/:tenantId/*` 下的路由 |

### 1.2 企业管理平台（homepage 项目）— 自举架构

> **核心理念：自举（Self-Bootstrapping）**
>
> homepage **本身就是一个应用**（project），与用户创建的业务应用在架构上**完全同构**——
> 它拥有自己的导航树、页面配置、路由表、数据表，与任何 `projectType="app"` 的项目使用相同的基础设施。
>
> homepage 的特殊之处不在于它的技术实现，而在于它的**职能**：
> 它用自身提供的页面配置能力来管理自身，用自身的导航体系来组织管理功能——这就是自举。
>
> ```
> homepage 应用 ≡ 一个普通应用 + 管理其他应用的能力
>                ↑                  ↑
>            同构基础设施          额外职能
>         （导航/页面/路由/数据）  （创建/配置/删除 app 项目）
> ```

#### 自举的具体含义

| 基础设施 | homepage 如何使用 | 业务应用如何使用 |
|---------|------------------|----------------|
| **导航树** | 组织管理功能（应用管理、页面管理、开发工具等） | 组织业务功能 |
| **页面配置** | dashboard / 管理页面的 rule.json + pagedata.json | 业务页面的 rule.json + pagedata.json |
| **路由表** | routes.json 包含 dashboard / page-manager / nav-manager 等 | routes.json 包含业务页面路由 |
| **数据表** | 存储应用列表、全局配置等管理数据 | 存储业务数据 |
| **权限** | 管控谁可以创建应用、编辑导航 | 管控业务数据读写 |

同一套 `Project → NavigationConfig → PageConfig → routes.json → DataTable` 管道，**homepage 和 app 走的是同一条路**。
homepage 不是凌驾于应用体系之上的"管理层"，而是体系内的**第一个应用**，恰好承担了管理其他应用的职责。

每个租户拥有 **1 个系统保留的自举应用（homepage）+ N 个用户自建业务应用**，二者均以 `ProjectEntity` 建模：

| 项目类型 | projectType | projectId | sortOrder | 说明 |
|---------|-------------|-----------|-----------|------|
| **企业管理平台** | `"homepage"` | `"homepage"` | 0 | 随租户自动创建，**不可删除**，登录后默认落地，自举管理 |
| **业务应用** | `"app"` | 自定义 ID | 100 | 由 homepage 应用创建，独立的工作空间 |

#### 为什么 dashboard 必须属于 homepage 项目？

`/t/{tenantId}/dashboard` 是 homepage 应用的**导航落地页**——不是游离于项目体系之外的静态页面，
而是 homepage 应用的一部分，与业务应用中的首页地位等同。自举要求：

1. **同构** — dashboard 和业务应用的页面一样，在 homepage 应用的导航树、路由表、page_config 表中注册
2. **可编排** — 后续可通过 homepage 应用自身的页面管理功能，将 dashboard 从 Vue 组件迁移到配置驱动
3. **统一导航** — dashboard 与应用管理、页面管理等管理页面在同一棵导航树中，用户无感知切换
4. **权限一致** — homepage 应用的权限体系统一管控所有管理页面（包括 dashboard）的访问

#### homepage 项目的导航结构（管理功能分区）

```
homepage 项目导航树
  ├── 📊 工作台 (/dashboard)          ← 登录后落地页，管理概览
  ├── 📱 应用管理                      ← ⭐ 核心：创建 / 管理业务应用
  │     ├── 应用列表                    ← 查看所有 projectType="app" 的项目
  │     ├── 创建应用                    ← 创建新的 project（自动分配导航/路由/数据表）
  │     └── 应用配置                    ← 编辑应用名称、图标、描述、排序
  ├── 🔧 开发工具
  │     ├── 页面管理 (/page-manager)
  │     ├── 导航管理 (/nav-manager)
  │     ├── 站点管理 (/site-manager)
  │     ├── 开发工作台 (/dev)
  │     └── 缓存管理 (/cache-manager)
  ├── ⚙️ 系统管理
  │     ├── 用户管理
  │     ├── 权限设置
  │     └── 系统设置 (/settings)
  └── 🤖 AI Studio                    ← AI 驱动的页面生成
```

> **应用管理是 homepage 项目的核心职能**：用户在此创建业务应用（`projectType="app"`），
> 每个业务应用被创建后拥有独立的导航树、页面配置、数据表。
> 切换到某个业务应用后，`defaultProjectId` 更新，所有 API 自动路由到该应用。

#### 生命周期

```
注册租户
  → AuthController.registerTenant()
    → ProjectService.ensureHomepage(tenantId)   ← 幂等，已存在则跳过
      → INSERT ProjectEntity { projectId="homepage", projectType="homepage",
                                name="企业管理平台", icon="🏗️", sortOrder=0 }
    → migrateNavigation()                        ← 从 navigation-default.json 初始化导航树
      → 包含 dashboard / 应用管理 / 开发工具 / 系统管理 等完整管理导航

登录
  → JWT { tenantId, defaultProjectId: "homepage" }
  → 前端 getUser().defaultProjectId → api-paths.ts → 所有 API 自动路由到 homepage 项目
  → 重定向到 /t/{tenantId}/dashboard（homepage 项目的导航落地页）
  → App.vue reloadNavigation() → 加载 homepage 项目的管理导航树

切换到业务应用（未来）
  → 更新 defaultProjectId → API 路径自动切换到目标应用
  → 加载目标应用的独立导航树
  → 目标应用有自己的 dashboard / 页面 / 数据表

返回管理平台
  → defaultProjectId 恢复为 "homepage"
  → 重新加载企业管理导航树
```

**保护机制**：`ProjectService.deleteProject()` 遇到 `projectType == "homepage"` 抛异常，防止误删。

### 1.3 业务应用（app 项目）— 与 homepage 完全同构

由 homepage 应用的「应用管理」功能创建。关键认知：**业务应用与 homepage 在架构上完全同构**——
它们使用完全相同的基础设施管道，没有任何"降级"或"简化"版本：

- **导航树**（NavigationConfig）：应用自己的菜单结构，独立于 homepage 导航
- **页面配置**（PageConfig）：应用自己的 rule.json / pagedata.json / script.js
- **路由表**（routes.json）：`DynamicRouter` 从应用的 routes.json 加载
- **数据表**（TableSchema + TableRow）：应用自己的业务数据
- **权限**：应用自己的权限快照

同构意味着：业务应用也可以有自己的 dashboard、自己的设置页面——与 homepage 应用的能力边界完全对等。

### 1.4 自举关系图

```
┌─────────────────────────────────────────────────────────────────┐
│  homepage 应用（企业管理平台）                                      │
│                                                                 │
│  基础设施（与 app 完全相同）：                                       │
│    导航树 → 应用管理 / 开发工具 / 系统管理 / ...                      │
│    页面配置 → dashboard / page-manager / nav-manager / ...        │
│    路由表 → routes.json                                          │
│    数据表 → 应用列表 / 全局配置 / ...                                │
│                                                                 │
│  额外职能（自举赋予）：                                              │
│    创建 / 配置 / 删除业务应用                                       │
│    ProjectService.createProject({ projectType: "app", ... })     │
│                                                                 │
│  API 路径：/api/tenants/{tid}/projects/homepage/...               │
│                                                                 │
│  切换入口 ──────────────┐                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────┐
│ app-A（业务应用）        app-B     app-C  │
│                                          │
│ 基础设施（与 homepage 完全相同）：           │
│   导航树 → 业务功能菜单                    │
│   页面配置 → 业务页面                      │
│   路由表 → routes.json                    │
│   数据表 → 业务数据                        │
│                                          │
│ API: /api/tenants/{tid}/projects/{id}/... │
│                                          │
│ 返回入口 → defaultProjectId = "homepage"  │
│            回到自举应用                    │
└──────────────────────────────────────────┘
```

> **自举的关键洞察**：homepage 和 app 之间**没有父子层级**（技术层面），
> 只有**职能分工**——homepage 恰好是那个"管理其他应用的应用"。
> 如果去掉管理职能，homepage 就是一个普通应用。

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

| 路由类型 | 路径模式 | 组件 | 注册方式 | 所属项目 |
|---------|---------|------|--------|----------|
| 公共路由 | `/`, `/login` | HomePage, LoginView | 静态声明 | 无（平台级） |
| 管理页面路由 | `/t/:tenantId/dashboard` 等 | Vue 组件 | staticRoutes → 同步到 page_config → routes.json | homepage |
| 配置页面路由 | `/t/:tenantId/{pageId}` | FCPageRenderer | DynamicRouter 从 routes.json 加载 | homepage 或 app |

> **关键**：管理页面路由（dashboard / page-manager / nav-manager 等）虽然使用 Vue 组件渲染，
> 但它们通过 `syncStaticRoutesToBackend()` 同步到 homepage 项目的 `page_config` 表，
> 并出现在 homepage 项目的 `routes.json` 和导航树中。
> 后端是路由的**单一数据源**，前端 staticRoutes 仅作为组件映射和离线兜底。

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
  → JWT { tenantId: "lmspark", defaultProjectId: "homepage" }
  → localStorage { spark_token, spark_user }
  → http.ts 拦截器自动注入 X-Tenant-Id / X-Project-Id: "homepage"

平台首页 (/)
  → 公共路由，无 API 调用
  → 点击"开始使用" → /login

进入企业管理平台 (/t/lmspark/dashboard)
  → App.vue onMounted
    → syncStaticRoutesToBackend()  ← 管理页面路由同步到 homepage 项目
    → registerRoutes()             ← 从 homepage 项目的 routes.json 加载所有路由
    → reloadNavigation()           ← 加载 homepage 项目的管理导航树
    → 渲染 dashboard（homepage 项目的落地页）

homepage 导航点击 → /t/lmspark/{管理页面}
  ├── pageType="vue-component" → 使用 Vue 组件（page-manager / nav-manager 等）
  └── pageType="config" → FCPageRenderer
      → ConfigLoader.load({pageId})
      → GET /api/pages-config/{pageId}/rule.json      (扁平路由 + Header)
      → GET /api/pages-config/{pageId}/pagedata.json
      → GET /api/pages-config/{pageId}/script.js

切换到业务应用（未来）
  → 更新 defaultProjectId = "appId"
  → reloadNavigation()  ← 加载业务应用的独立导航树
  → registerRoutes()    ← 加载业务应用的 routes.json
  → 进入业务应用的工作空间

返回管理平台
  → defaultProjectId = "homepage"
  → reloadNavigation()  ← 恢复企业管理导航树
```

## 6. 关键设计约束

1. **homepage 项目 = 企业管理平台**：不是普通「首页」，而是创建/管理业务应用的控制中心，dashboard 是其落地页
2. **后端是单一数据源**：所有路由、导航、页面配置都存储在后端，前端通过 API 获取
3. **JWT tenantId 验证**：后端 JwtAuthFilter 检查 X-Tenant-Id 请求头与 JWT claim 一致
4. **homepage 不可删除**：每个租户的 homepage 项目由系统保证存在
5. **DynamicRouter 双通道**：vue-component 路由用预注册组件，config 路由用 PageRenderer
6. **dashboard 归属 homepage 项目**：通过 `syncStaticRoutesToBackend()` 同步到 page_config 表，出现在 homepage 项目的 routes.json 和导航树中
7. **ConfigLoader 走扁平路由**：`/api/pages-config/{pageId}/{file}`（依赖 Header 推断 tenant/project）
8. **管理 API 走显式路由**：`/api/tenants/{tid}/projects/{pid}/...`（URL 中包含完整作用域）
9. **项目切换 = 导航切换**：切换 `defaultProjectId` 后，导航树和路由表自动切换到目标项目

## 7. 演进路线

### 已实现

- ✅ homepage 项目自动创建与保护
- ✅ 管理页面通过 staticRoutes 同步到 homepage 项目
- ✅ homepage 导航树包含 dashboard + 管理工具
- ✅ 所有 API 通过 `defaultProjectId = "homepage"` 自动路由到管理平台

### 近期（应用管理）

- 📱 应用管理页面（创建 / 列表 / 配置 / 删除业务应用）
- 🔄 项目切换机制（更新 `defaultProjectId` + 重载导航/路由）
- 📊 dashboard 可编排化（从 Vue 组件迁移到 config 驱动）

### 远期

- 🎨 dashboard 拖拽式布局编辑器
- 📦 应用模板（从模板一键创建业务应用 + 预置导航/页面/数据）
- 🔐 应用级权限（不同用户看到不同的应用列表）
