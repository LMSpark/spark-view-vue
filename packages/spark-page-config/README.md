# @spark-view/spark-page-config

SPARK 页面配置层（L2 业务编排层）- 支持本地/远程配置加载、动态路由注册、配置缓存和验证。

## 📦 功能特性

- ✅ **多源加载** - 支持本地（SPA）/远程（API）/混合模式
- ✅ **动态路由** - 运行时注册路由，支持懒加载
- ✅ **配置缓存** - 内存缓存，可配置过期时间
- ✅ **配置验证** - Schema 验证，确保配置正确性
- ✅ **脚本沙箱** - 安全执行页面脚本
- ✅ **热更新** - 支持配置刷新
- ✅ **L1 集成** - 完整对接应用层 Logger、Constants、ErrorCodes

## 🔗 与 L1 的集成

L2 (spark-page-config) 依赖 L1 (spark-app) 提供的基础设施：

- **Logger 系统** - 使用 `pageLogger` 和 `routerLogger` 记录日志
- **符号常量** - 使用 `DefaultConfig`、`ErrorCodes`、`StorageKeys`
- **错误处理** - 统一的错误码和错误消息
- **权限过滤** - 通过 `beforeRegister` 钩子集成 L1 的权限系统

详细集成说明请参阅 [INTEGRATION.md](./INTEGRATION.md)。

## 📁 配置文件结构

```
public/pages-config/
├── routes.json           # 路由配置
└── <pageId>/
    ├── rule.json         # 页面规则（组件树）
    ├── pagedata.json     # 页面数据
    └── script.js         # 页面脚本（可选）
```

### routes.json
```json
[
  {
    "path": "/home",
    "name": "home",
    "pageId": "home",
    "meta": {
      "title": "首页",
      "icon": "🏠",
      "requiresAuth": true,
      "permissions": ["home:view"]
    }
  }
]
```

### rule.json
```json
[
  {
    "type": "div",
    "class": "page-container",
    "children": [
      {
        "type": "el-button",
        "props": {
          "type": "primary"
        },
        "on": {
          "click": "handleClick"
        },
        "children": ["点击我"]
      }
    ]
  }
]
```

### pagedata.json
```json
{
  "title": "欢迎",
  "users": [
    { "id": 1, "name": "张三" }
  ]
}
```

### script.js
```javascript
// ES6 模块导出
export function handleClick() {
  alert('按钮被点击')
}

export function onMounted() {
  console.log('页面加载完成')
}
```

## 🚀 快速开始

### 1. 安装

```bash
pnpm add @spark-view/spark-page-config
```

### 2. SPA 模式（本地配置）

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import DynamicPage from './DynamicPage.vue'

// 创建配置加载器
const configLoader = SparkPageConfig.createLoader({
  source: 'local',            // 本地模式
  localPrefix: '/pages-config'
})

// 创建路由
const router = createRouter({
  history: createWebHistory(),
  routes: []
})

// 设置动态路由
await SparkPageConfig.setupRoutes(
  router,
  configLoader,
  DynamicPage  // 动态页面组件
)

app.use(router)
```

### 3. SSR/API 模式（远程配置）

```typescript
const configLoader = SparkPageConfig.createLoader({
  source: 'remote',              // 远程模式
  apiBaseUrl: '/api',
  enableCache: true,
  cacheExpiry: 5 * 60 * 1000     // 5分钟
})

await SparkPageConfig.setupRoutes(router, configLoader, DynamicPage)
```

### 4. 混合模式（优先远程，降级本地）

```typescript
const configLoader = SparkPageConfig.createLoader({
  source: 'hybrid',              // 混合模式
  apiBaseUrl: '/api',
  localPrefix: '/pages-config',
  timeout: 3000                  // 3秒超时
})
```

## 📖 API 文档

### ConfigLoader

#### 创建加载器

```typescript
const loader = SparkPageConfig.createLoader({
  source: 'local' | 'remote' | 'hybrid',
  apiBaseUrl: '/api',
  localPrefix: '/pages-config',
  enableCache: true,
  cacheExpiry: 300000,
  enableValidation: false,
  timeout: 10000
})
```

#### 加载配置

```typescript
// 加载路由配置
const result = await loader.loadRoutes()
if (result.success) {
  console.log(result.data)  // RouteConfig[]
}

// 加载页面配置（包含 rule + data + script）
const pageResult = await loader.loadPageConfig('home')
if (pageResult.success) {
  const { rule, data, script } = pageResult.data
}

// 加载单独配置
await loader.loadRule('home')
await loader.loadPageData('home')
await loader.loadScript('home')
```

#### 缓存管理

```typescript
// 清除所有缓存
loader.clearCache()

// 清除特定缓存
loader.clearCache('routes')
loader.clearCache('page:home')

// 获取缓存统计
const stats = loader.getCacheStats()
console.log(stats.size, stats.keys)
```

### DynamicRouter

#### 创建路由管理器

```typescript
const dynamicRouter = SparkPageConfig.createRouter({
  router,           // Vue Router 实例
  configLoader,     // ConfigLoader 实例
  pageComponent     // 动态页面组件
})
```

#### 路由操作

```typescript
// 注册所有路由
await dynamicRouter.registerRoutes()

// 注册单个路由
await dynamicRouter.registerRoute({
  path: '/new-page',
  name: 'new-page',
  pageId: 'new-page'
})

// 移除路由
dynamicRouter.removeRoute('new-page')

// 刷新路由（重新加载配置）
await dynamicRouter.refreshRoutes()

// 获取已注册路由
const routes = dynamicRouter.getRegisteredRoutes()
```

### 配置验证

```typescript
import { SparkPageConfig } from '@spark-view/spark-page-config'

// 验证单个路由
const errors = SparkPageConfig.validate.route(routeConfig)
if (errors.length > 0) {
  console.error('路由配置错误:', errors)
}

// 验证所有路由
const errorMap = SparkPageConfig.validate.routes(routes)
errorMap.forEach((errors, path) => {
  console.error(`${path}: `, errors)
})

// 验证规则配置
const ruleErrors = SparkPageConfig.validate.rule(ruleConfig)

// 验证页面数据
const dataErrors = SparkPageConfig.validate.pageData(pageData)
```

## 🔧 高级用法

### 自定义配置转换

```typescript
const dynamicRouter = SparkPageConfig.createRouter({
  router,
  configLoader,
  pageComponent,
  
  // 路由注册前转换
  beforeRegister: async (routes) => {
    // 过滤没有权限的路由
    return routes.filter(route => 
      hasPermission(route.meta?.permissions)
    )
  },
  
  // 路由注册后回调
  afterRegister: (routes) => {
    console.log('已注册路由:', routes.length)
  }
})
```

### 配置热更新

```typescript
// 监听配置更新事件（WebSocket）
socket.on('config-update', async () => {
  // 清除缓存并刷新路由
  await dynamicRouter.refreshRoutes()
  console.log('路由配置已更新')
})
```

### 自定义加载器

```typescript
class CustomConfigLoader implements ConfigLoader {
  async loadRoutes() {
    // 自定义加载逻辑
    const data = await myCustomFetch('/routes')
    return { success: true, data }
  }
  
  // ... 实现其他方法
}
```

## 🌐 服务端 API 规范

### 路由配置接口

```
GET /api/routes
Response: RouteConfig[]
```

### 页面配置接口

```
GET /api/page/:pageId/rule
Response: RuleConfig[]

GET /api/page/:pageId/data
Response: PageDataConfig

GET /api/page/:pageId/script
Response: string (JavaScript code)
```

### 标准响应格式

```json
{
  "code": 200,
  "data": { ... },
  "message": "success"
}
```

## 📝 类型定义

```typescript
interface RouteConfig {
  path: string
  name: string
  pageId: string
  meta?: {
    title?: string
    icon?: string
    requiresAuth?: boolean
    permissions?: string[]
    [key: string]: any
  }
}

interface RuleConfig {
  type: string
  props?: Record<string, any>
  children?: (RuleConfig | string)[]
  style?: Record<string, any>
  class?: string | string[]
  on?: Record<string, string>
  slots?: Record<string, RuleConfig[]>
}

interface PageConfig {
  pageId: string
  rule: RuleConfig[]
  data: PageDataConfig
  script?: PageScriptConfig
}
```

## 🏗️ 架构说明

### L2 业务编排层职责

1. **配置加载** - 从本地/远程加载页面配置
2. **配置解析** - 将配置转换为运行时数据
3. **路由注册** - 动态注册页面路由
4. **配置缓存** - 提高加载性能
5. **配置验证** - 确保配置正确性

### 与其他层的关系

```
L1 Application Layer (spark-app)
  ↓ 提供 Router、AppContext
L2 Business Orchestration (spark-page-config)  ← 本包
  ↓ 提供 PageConfig、DynamicRouter
L3 Model Layer
  ↓ 使用 PageConfig 渲染页面
L4-L6 Operation/Capability/Component Layers
```

## 📚 示例项目

查看 [examples/](../../examples/) 目录获取完整示例：
- SPA 单页应用示例
- SSR 服务端渲染示例
- 混合模式示例

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT
