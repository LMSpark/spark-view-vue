# Mock Data & API Handlers

该目录包含开发环境使用的 Mock 数据和 API 处理器。

## 目录结构

```
mocks/
├── api.ts              # vite-plugin-mock API 处理器
├── database/           # Mock 数据库文件
├── pageData.json       # 页面数据示例
└── pageRule.json       # 页面规则示例
```

## 使用方式

### 开发环境

Mock 数据由 `vite-plugin-mock` 自动加载，拦截 `/api/*` 请求：

```typescript
// GET /api/getPageConfig?pageId=xxx
// GET /api/getRoutes
```

### 配置说明

**api.ts** - Mock API 路由定义
- 使用 `MockMethod` 类型定义 API 处理器
- 支持动态加载 `database/` 中的 JSON 文件
- 支持动态加载 `pages-config/` 中的页面配置

**database/** - 静态 Mock 数据
- 存放可复用的测试数据
- JSON 格式，便于维护和版本控制

## 架构说明

### 为什么在项目根目录？

1. **标准实践** - Mock 数据属于项目基础设施，与 `tests/`、`docs/`、`tools/` 同级
2. **开发工具** - 仅用于开发环境，不参与应用构建
3. **清晰分离** - `src/` 只包含应用代码，基础设施代码放在根目录

### 与 src/services/ 的关系

```
src/services/        # 应用层 API 服务（请求真实/Mock API）
mocks/              # 开发工具（提供 Mock API 响应）
```

- `src/services/page-config.ts` 发起 API 请求
- `mocks/api.ts` 在开发环境拦截并响应请求
- 生产环境直接请求真实 API，不使用 Mock

## 示例

### 添加新的 Mock API

```typescript
// mocks/api.ts
export default [
  {
    url: '/api/myNewApi',
    method: 'get',
    response: () => {
      return {
        code: 200,
        data: { /* your data */ }
      }
    }
  }
] as MockMethod[]
```

### 使用 Mock 数据库

```typescript
// mocks/database/users.json
{
  "users": [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": "Bob" }
  ]
}

// mocks/api.ts
const users = await import('./database/users.json')
return { code: 200, data: users.default }
```
