# SPARK 6层架构 - 企业级低代码平台

> 基于 Vue 3 + TypeScript 的分层架构系统

## 🏗️ 架构概览

SPARK 采用 6 层架构设计，职责清晰、松耦合、易扩展：

```
┌─────────────────────────────────────────────┐
│  L1: @spark-view/spark-app                 │  基础设施层
│  → Logger, ErrorHandler, Bootstrap         │
├─────────────────────────────────────────────┤
│  L2: @spark-view/spark-page-config         │  业务编排层
│  → ConfigLoader, DynamicRouter             │
├─────────────────────────────────────────────┤
│  L3: @spark-view/spark-renderer            │  模型层
│  → PageRenderer, DataBinding, Sandbox      │
├─────────────────────────────────────────────┤
│  L4: Operation Layer                       │  组件操作层
│  → ComponentManager                         │
├─────────────────────────────────────────────┤
│  L5: Capability Layer                      │  能力层
│  → CapabilitySystem, Provider/Consumer     │
├─────────────────────────────────────────────┤
│  L6: Component Layer                       │  组件层
│  → ComponentRegistry, Renderer             │
└─────────────────────────────────────────────┘
         ↑ L4-L6 统一打包为 @spark-view/spark-core
```

## 📦 包结构

### 核心包
- `@spark-view/spark-app` - L1 基础设施（日志、错误、启动）
- `@spark-view/spark-page-config` - L2 业务编排（配置、路由）
- `@spark-view/spark-renderer` - L3 模型渲染（页面、数据）
- `@spark-view/spark-core` - L4-L6 组件核心（能力系统）
- `@spark-view/spark-data` - 数据管理（DataSet、Tree）

### 主应用
- `src/` - 主应用入口（使用包系统）
- `features/` - 业务特性模块
- `public/pages-config/` - 页面配置

## 🚀 快速开始

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
pnpm run dev
```

### 构建
```bash
pnpm run build
```

### 类型检查
```bash
pnpm run typecheck
```

## 📖 核心概念

### 1. 依赖倒置原则

**上游只提供能力和事件，不直接操作下游**

```typescript
// ✅ 正确：L1 通过回调与 L2/L3 通信
SparkApp.bootstrap({
  beforeMount: async (context) => {
    // L1 发射事件，L2 处理
  }
})

// ❌ 错误：L1 直接实例化 L2
import { ConfigLoader } from '@spark-view/spark-page-config'
const loader = new ConfigLoader()  // 违反依赖倒置！
```

### 2. 单一职责

每层职责明确：
- **L1**: 基础设施（不关心业务）
- **L2**: 业务编排（不关心渲染）
- **L3**: 模型渲染（不关心路由）
- **L4-L6**: 组件核心（完全独立）

### 3. 开闭原则

通过接口和事件扩展，不修改源码：

```typescript
// 扩展：注入自定义 Logger
const customLogger = createCustomLogger()
SparkApp.bootstrap({
  logger: customLogger  // 依赖注入
})

// 扩展：监听路由注册事件
SparkPageConfig.createDynamicRouter({
  onRouteRegistered: (route) => {
    console.log('Route registered:', route)
  }
})
```

## 🔧 使用示例

### 应用启动

```typescript
// main.ts
import { SparkApp } from '@spark-view/spark-app'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import { Spark } from '@spark-view/spark-core'

async function initApp() {
  const app = createApp(App)
  const router = createRouter({ ... })
  
  // 初始化 SPARK 核心
  const sparkManager = Spark.createComponentManager()
  const sparkRegistry = Spark.createComponentRegistry()
  app.use(Spark.createVuePlugin({ manager: sparkManager, registry: sparkRegistry }))
  
  // 创建配置加载器
  const configLoader = SparkPageConfig.createConfigLoader({
    basePath: '/pages-config',
    enableCache: true
  })
  
  // 创建动态路由
  const dynamicRouter = SparkPageConfig.createDynamicRouter({
    router,
    configLoader,
    pageComponent: DynamicPage
  })
  
  await dynamicRouter.registerRoutes()
  
  // Bootstrap 启动
  await SparkApp.bootstrap({
    app,
    router,
    config: {
      apiBaseUrl: '/api',
      logLevel: 'debug'
    }
  })
}
```

### 使用 Logger

```typescript
import { pageLogger } from '@spark-view/spark-page-config'

// L2 提供的页面级 Logger
pageLogger.info('页面加载完成', { pageId: 'home' })
pageLogger.error('加载失败', error)
```

### 加载页面配置

```typescript
import { SparkPageConfig } from '@spark-view/spark-page-config'

const configLoader = SparkPageConfig.createConfigLoader({
  basePath: '/pages-config'
})

const config = await configLoader.loadPageConfig('home')
```

## 📂 项目结构

```
.
├── packages/                  # 核心包（monorepo）
│   ├── spark-app/            # L1 基础设施
│   ├── spark-page-config/    # L2 业务编排
│   ├── spark-renderer/       # L3 模型渲染
│   ├── spark-core/           # L4-L6 组件核心
│   └── spark-data/           # 数据管理
├── src/                      # 主应用
│   ├── main.ts              # 应用入口
│   ├── App.vue              # 根组件
│   └── views/               # 视图
├── features/                 # 特性模块
├── public/                   # 静态资源
│   └── pages-config/        # 页面配置
├── docs/                     # 文档
│   ├── DEPENDENCY_RULES.md  # 依赖规则
│   └── REFACTORING_PROGRESS.md  # 重构进度
└── tests/                    # 测试
```

## 🎯 设计原则

### ✅ 正确的依赖方向

```
L3 → L2 → L1  (允许：下游依赖上游)
L1-L3 → L4-L6 (允许：所有层使用核心)
```

### ❌ 禁止的依赖方向

```
L1 → L2/L3    (禁止：上游依赖下游)
L2 → L3       (禁止：跨层依赖)
L4-L6 → L1-L3 (禁止：核心依赖业务)
```

## 📚 文档

- [架构依赖规则](./docs/DEPENDENCY_RULES.md)
- [重构进度](./docs/REFACTORING_PROGRESS.md)
- [主应用架构](./docs/MAIN_APP_ARCHITECTURE.md)
- [SPARK 架构详解](./docs/architecture/SPARK_ARCHITECTURE.md)

## 🧪 测试

```bash
# 运行所有测试
pnpm run test

# 类型检查
pnpm run typecheck

# Lint
pnpm run lint
```

## 🔍 类型安全

项目启用了 TypeScript 严格模式：

- ✅ `strict: true`
- ✅ `noImplicitAny: true`
- ✅ `strictNullChecks: true`
- ✅ `noUncheckedIndexedAccess: true`

## 📝 贡献指南

1. **添加新功能** → 添加到对应的包
2. **修改已有功能** → 遵循开闭原则
3. **不要破坏依赖规则** → 上游不操作下游
4. **保持类型安全** → 避免使用 `any`

## 📄 License

MIT

---

**版本**: 2.0.0  
**架构状态**: ✅ 重构完成  
**最后更新**: 2026-02-02
