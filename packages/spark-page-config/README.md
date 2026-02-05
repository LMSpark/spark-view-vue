# @spark-view/spark-page-config

> SPARK 页面配置层 - 支持本地/远程配置加载、动态路由和配置验证

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-green.svg)](https://vuejs.org/)

## 特性

-  **多源加载** - 本地（SPA）/远程（API）/混合模式
-  **动态路由** - 运行时注册路由，支持懒加载
-  **配置缓存** - 内存缓存，可配置过期时间
-  **配置验证** - Schema 验证，确保配置正确
-  **脚本沙箱** - 安全执行页面脚本
-  **热更新** - 支持配置刷新

## 安装

\\\ash
pnpm add @spark-view/spark-page-config
\\\

## 快速开始

### 1. 配置文件结构

\\\
public/pages-config/
 routes.json           # 路由配置
 <pageId>/
     rule.json         # 页面规则（组件树）
     pagedata.json     # 页面数据
     script.js         # 页面脚本（可选）
\\\

### 2. 路由配置 (routes.json)

\\\json
[
  {
    &quot;path&quot;: &quot;/home&quot;,
    &quot;name&quot;: &quot;home&quot;,
    &quot;pageId&quot;: &quot;home&quot;,
    &quot;meta&quot;: {
      &quot;title&quot;: &quot;首页&quot;,
      &quot;icon&quot;: &quot;&quot;,
      &quot;requiresAuth&quot;: true
    }
  }
]
\\\

### 3. 页面规则 (rule.json)

\\\json
{
  &quot;type&quot;: &quot;container&quot;,
  &quot;id&quot;: &quot;root&quot;,
  &quot;children&quot;: [
    {
      &quot;type&quot;: &quot;spark-ej2-grid&quot;,
      &quot;id&quot;: &quot;userGrid&quot;,
      &quot;props&quot;: {
        &quot;dataSource&quot;: &quot;@{dataSet.Users}&quot;
      }
    }
  ]
}
\\\

### 4. 使用配置加载器

\\\	ypescript
import { ConfigLoader } from '@spark-view/spark-page-config'

// 创建加载器
const loader = new ConfigLoader({
  mode: 'local',  // 'local' | 'remote' | 'hybrid'
  basePath: '/pages-config',
  cache: true
})

// 加载路由配置
const routes = await loader.loadRoutes()

// 加载页面配置
const pageConfig = await loader.loadPageConfig('home')
\\\

### 5. 动态路由注册

\\\	ypescript
import { registerDynamicRoutes } from '@spark-view/spark-page-config'
import { createRouter } from 'vue-router'

const router = createRouter({ ... })

// 注册动态路由
await registerDynamicRoutes(router, {
  loader,
  beforeRegister: (route) => {
    // 过滤或修改路由
    return checkPermission(route)
  }
})
\\\

## 核心 API

### ConfigLoader

配置加载器

\\\	ypescript
const loader = new ConfigLoader({
  mode: 'local',           // 加载模式
  basePath: '/config',     // 基础路径
  cache: true,             // 启用缓存
  cacheTTL: 60000          // 缓存过期时间（毫秒）
})

// 加载方法
await loader.loadRoutes()                    // 加载路由
await loader.loadPageConfig(pageId)          // 加载页面配置
await loader.loadPageRule(pageId)            // 加载页面规则
await loader.loadPageData(pageId)            // 加载页面数据
await loader.loadPageScript(pageId)          // 加载页面脚本

// 缓存管理
loader.clearCache()                          // 清空缓存
loader.refreshConfig(pageId)                 // 刷新指定配置
\\\

### 配置验证

\\\	ypescript
import { validatePageConfig } from '@spark-view/spark-page-config'

const result = validatePageConfig(config)
if (!result.valid) {
  console.error('配置无效:', result.errors)
}
\\\

## 与 L1 (spark-app) 集成

本包依赖 [spark-app](../spark-app/README.md) 提供的基础设施：

- **Logger** - 使用 \pageLogger\ 和 \outerLogger\
- **符号常量** - 使用 \DefaultConfig\、\ErrorCodes\
- **错误处理** - 统一错误码和消息
- **权限过滤** - 通过 \eforeRegister\ 钩子集成

详细集成说明请查阅 [INTEGRATION.md](./INTEGRATION.md)。

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

\\\json
{
  &quot;@spark-view/spark-app&quot;: &quot;workspace:*&quot;,
  &quot;vue-router&quot;: &quot;^4.2.0&quot;
}
\\\

## 开发命令

\\\ash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
\\\

## License

MIT