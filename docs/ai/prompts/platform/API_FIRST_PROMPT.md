# API-first 提示词（前端优先，禁止默认改后端）

> 适用场景：页面配置、路由同步、导航、项目管理、数据 CRUD、缓存清理、日志、AI 生成等需求。
>
> 所属： [AI 提示词体系](../README.md) / [平台基础](README.md) / API-first 规则基线。

## 一、执行原则（强约束）

1. 先做 API 覆盖判定：若现有后端 API 能实现，**只改前端调用链**，不改后端 Controller/Service。
2. 历史数据迁移必须由前端显式调用 API 触发，禁止恢复后端启动期隐式迁移。
3. 多租户请求优先使用 `/api/tenants/{tenantId}/projects/{projectId}/...`。
4. 仅在兼容场景使用扁平 `/api/pages-config/**`，并确保请求头包含 `X-Tenant-Id`、`X-Project-Id`。
5. pages-config 写入优先 `__batch`，减少重绑与事件风暴。
6. 错误处理必须 fail-fast，禁止静默兜底掩盖根因。

## 二、后端完整 API 清单（按 Controller，2026-03-17 校验）

### 1) AI 对话与页面生成（AiChatController）

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/ai/chat` | 页面生成（generate/iterate，非流式） |
| `POST` | `/api/ai/chat/stream-page` | 页面生成流式 SSE（phase/delta/reasoning/result/done/error） |
| `POST` | `/api/ai/chat/stream` | 通用对话流式 SSE |
| `POST` | `/api/ai/upload` | 上传聊天附件（multipart/form-data） |
| `POST` | `/api/ai/component-metadata` | 上传组件元数据 |
| `GET` | `/api/ai/component-metadata` | 查询组件元数据状态 |

### 2) 页面配置（PageConfigController）

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/api/events` | 统一 SSE 事件流 |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/__list` | 页面列表 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/__create` | 创建页面 |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}` | 删除页面 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/__sync-routes` | 同步 routes |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/routes.json` | 读取 routes.json |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}` | 读取页面文件 |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}` | 写入单文件 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/__batch` | 批量写入 |

### 兼容接口（扁平路径，需头部上下文）

| Method | Path |
|---|---|
| `POST` | `/api/pages-config/__sync-routes` |
| `GET` | `/api/pages-config/routes.json` |
| `GET` | `/api/pages-config/{pageId}/{filename}` |
| `PUT` | `/api/pages-config/{pageId}/{filename}` |
| `POST` | `/api/pages-config/{pageId}/__batch` |
| `GET` | `/api/pages-config/__list` |
| `POST` | `/api/pages-config/__create` |
| `DELETE` | `/api/pages-config/{pageId}` |

### 3) 导航管理（NavigationController，多租户）

| Method | Path |
|---|---|
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/navigation` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/navigation` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}/move` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/link-probe` |

### 4) 项目管理（ProjectController，多租户）

| Method | Path |
|---|---|
| `GET` | `/api/tenants/{tenantId}/projects` |
| `POST` | `/api/tenants/{tenantId}/projects` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}` |

### 5) 通用数据 CRUD（GenericTableController，多租户）

| Method | Path |
|---|---|
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/data` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `PATCH` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/__batch` |

### 6) 表 DDL（TableDdlController）

| Method | Path |
|---|---|
| `GET` | `/api/tables` |
| `POST` | `/api/tables` |
| `GET` | `/api/tables/{tableName}` |
| `DELETE` | `/api/tables/{tableName}` |
| `POST` | `/api/tables/{tableName}/columns` |
| `PUT` | `/api/tables/{tableName}/columns/{columnName}` |
| `DELETE` | `/api/tables/{tableName}/columns/{columnName}` |

### 7) 认证（AuthController）

| Method | Path |
|---|---|
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/register` |
| `POST` | `/api/auth/register-tenant` |
| `GET` | `/api/auth/me` |

### 8) 应用配置（AppConfigController）

| Method | Path |
|---|---|
| `GET` | `/api/config/default` |
| `GET` | `/api/config/tenant/{tenantId}` |
| `POST` | `/api/config/tenant/{tenantId}` |
| `DELETE` | `/api/config/tenant/{tenantId}` |
| `GET` | `/api/tenants` |
| `GET` | `/health` |

### 9) 缓存（CacheController）

| Method | Path |
|---|---|
| `GET` | `/api/cache/stats` |
| `POST` | `/api/cache/clear-metadata` |

### 10) 日志（LogsController）

| Method | Path |
|---|---|
| `POST` | `/api/logs` |

### 11) SAP（SapController）

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/sap/chat` | SAP AI 对话 |
| `POST` | `/api/sap/execute` | 执行 SAP 协议（`text/plain`） |

## 三、可直接复制的最小提示词

```text
需求先做 API 覆盖判定：若现有 API 可实现，禁止默认修改后端 Controller/Service；
页面/导航/项目/数据操作优先走多租户 API（/api/tenants/{tenantId}/projects/{projectId}/...）；
历史迁移必须由前端显式调用 API 触发，禁止后端启动期隐式迁移；
pages-config 写入优先 __batch；
错误必须 fail-fast 显式暴露，禁止静默兜底。
```
