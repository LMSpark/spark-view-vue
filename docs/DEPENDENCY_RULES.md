# SPARK 架构依赖规则

> 确保上游只提供能力和事件机制，不直接操作下游

## 📊 依赖层级关系

```
L1 (spark-app)           - 基础设施层
  ↓ 提供能力
L2 (spark-page-config)   - 业务编排层  
  ↓ 提供配置
L3 (spark-renderer)      - 模型层
  ↓ 使用
L4-L6 (spark-core)       - 组件核心（独立）
```

## ✅ 依赖规则

### 规则 1: 向下依赖，向上提供能力

**允许的依赖方向**：
- ✅ L3 → L2 (L3 可以 import L2 的类型和接口)
- ✅ L3 → L1 (L3 可以 import L1 的 Logger、ErrorCodes 等工具)
- ✅ L2 → L1 (L2 可以 import L1 的工具)
- ✅ L1-L3 → L4-L6 (所有层都可以使用 spark-core)

**禁止的依赖方向**：
- ❌ L1 → L2 (L1 不能 import L2 的任何东西)
- ❌ L1 → L3 (L1 不能 import L3 的任何东西)
- ❌ L2 → L3 (L2 不能 import L3 的任何东西)
- ❌ L4-L6 → L1/L2/L3 (spark-core 必须保持独立)

### 规则 2: 上游通过接口和事件与下游通信

**L1 提供给 L2/L3 的能力**：
```typescript
// ✅ 正确：通过接口注入
interface BootstrapOptions {
  onPhaseChange?: (phase: string) => void  // 事件回调
  logger?: LoggerApi                        // 接口注入
}

// ❌ 错误：直接操作下游
function bootstrap(options: BootstrapOptions) {
  const configLoader = new ConfigLoader()  // 不应该直接 new L2 的类
  configLoader.loadAll()                    // 不应该直接调用 L2 的方法
}
```

**L2 提供给 L3 的能力**：
```typescript
// ✅ 正确：通过配置对象
interface DynamicRouterOptions {
  onRouteRegistered?: (route: RouteConfig) => void  // 事件回调
  pageComponent?: Component                         // 组件注入
}

// ❌ 错误：直接操作下游
function setupRouter(options: DynamicRouterOptions) {
  const renderer = new PageRenderer()      // 不应该直接 new L3 的类
  renderer.render(config)                   // 不应该直接调用 L3 的方法
}
```

### 规则 3: 使用依赖注入而非直接实例化

**正确的模式**：
```typescript
// L1: 提供工具作为依赖
export interface LoggerApi {
  debug(message: string): void
  info(message: string): void
  error(message: string): void
}

export function createLogger(): LoggerApi {
  // ...
}

// L2: 接收注入的依赖
export class ConfigLoader {
  constructor(private logger: LoggerApi) {}
  
  async loadConfig() {
    this.logger.info('Loading config...')
  }
}

// L3: 使用注入的依赖
export class PageRenderer {
  constructor(
    private configLoader: ConfigLoader,
    private logger: LoggerApi
  ) {}
}
```

**错误的模式**：
```typescript
// ❌ L2 直接实例化 L3
export class ConfigLoader {
  async loadAndRender() {
    const config = await this.loadConfig()
    const renderer = new PageRenderer()  // 错误！
    renderer.render(config)              // 错误！
  }
}
```

## 🔍 当前状态检查

### ✅ L1 (spark-app) 依赖检查

**检查命令**：
```bash
grep -r "from.*spark-(page-config|renderer)" packages/spark-app/
```

**结果**: ✅ 无违规依赖

**分析**：
- L1 不直接 import L2/L3 的任何东西
- L1 通过接口（Logger、ErrorHandler）提供能力
- L1 通过回调（beforeMount、afterMount）接收事件

### ✅ L2 (spark-page-config) 依赖检查

**检查命令**：
```bash
grep -r "from.*spark-renderer" packages/spark-page-config/
```

**结果**: ✅ 无违规依赖

**分析**：
- L2 不直接 import L3 的任何东西
- L2 通过 DynamicRouterOptions.pageComponent 接收组件注入
- L2 通过回调（beforeRegister、afterRegister）提供事件

### ✅ L3 (spark-renderer) 依赖检查

**允许的依赖**：
```typescript
// ✅ 使用 L1 的工具
import { Logger, ErrorCodes } from '@spark-view/spark-app'

// ✅ 使用 L2 的类型和接口
import type { RuleConfig, PageDataConfig } from '@spark-view/spark-page-config'

// ✅ 使用 L4-L6 的核心能力
import { Spark } from '@spark-view/spark-core'
```

### ✅ L4-L6 (spark-core) 独立性检查

**检查命令**：
```bash
grep -r "from.*spark-(app|page-config|renderer)" packages/spark-core/
```

**结果**: ✅ 完全独立

**分析**：
- spark-core 不依赖任何其他 SPARK 包
- spark-core 只依赖 vue 和基础库
- spark-core 可以独立发布和使用

## 📋 架构守卫规则

### ESLint 配置建议

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@spark-view/spark-page-config/*', '@spark-view/spark-renderer/*'],
          message: 'L1 (spark-app) cannot import from L2 or L3'
        }
      ]
    }]
  },
  overrides: [
    {
      files: ['packages/spark-page-config/**/*'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['@spark-view/spark-renderer/*'],
              message: 'L2 (spark-page-config) cannot import from L3'
            }
          ]
        }]
      }
    },
    {
      files: ['packages/spark-core/**/*'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              group: ['@spark-view/spark-app/*', '@spark-view/spark-page-config/*', '@spark-view/spark-renderer/*'],
              message: 'L4-L6 (spark-core) must remain independent'
            }
          ]
        }]
      }
    }
  ]
}
```

### Pre-commit Hook

```bash
#!/bin/bash
# .husky/pre-commit

echo "Checking architecture dependencies..."

# Check L1 → L2/L3
if grep -r "from.*spark-\(page-config\|renderer\)" packages/spark-app/src/; then
  echo "❌ Error: L1 (spark-app) cannot depend on L2 or L3"
  exit 1
fi

# Check L2 → L3
if grep -r "from.*spark-renderer" packages/spark-page-config/src/; then
  echo "❌ Error: L2 (spark-page-config) cannot depend on L3"
  exit 1
fi

# Check L4-L6 → L1/L2/L3
if grep -r "from.*spark-\(app\|page-config\|renderer\)" packages/spark-core/src/; then
  echo "❌ Error: L4-L6 (spark-core) must remain independent"
  exit 1
fi

echo "✅ Architecture dependencies check passed"
```

## 💡 重构指南

### 场景 1: L1 需要通知 L2/L3 某个事件

**错误做法**：
```typescript
// ❌ L1 直接调用 L2
import { ConfigLoader } from '@spark-view/spark-page-config'

function onUserLogin(user: User) {
  const loader = new ConfigLoader()
  loader.reloadConfig()  // 错误！
}
```

**正确做法**：
```typescript
// ✅ L1 发射事件，L2 监听
export interface BootstrapOptions {
  onUserLogin?: (user: User) => void
}

export function bootstrap(options: BootstrapOptions) {
  // ...
  if (options.onUserLogin) {
    options.onUserLogin(currentUser)
  }
}

// 主应用中连接
bootstrap({
  onUserLogin: (user) => {
    configLoader.reloadConfig()  // L2 的实例在主应用中
  }
})
```

### 场景 2: L2 需要控制 L3 的渲染

**错误做法**：
```typescript
// ❌ L2 直接操作 L3
import { PageRenderer } from '@spark-view/spark-renderer'

export class DynamicRouter {
  private renderer = new PageRenderer()  // 错误！
  
  async registerRoute(config: RouteConfig) {
    await this.renderer.render(config)   // 错误！
  }
}
```

**正确做法**：
```typescript
// ✅ L2 通过配置对象接收 L3 组件
export interface DynamicRouterOptions {
  pageComponent: Component  // 接收注入的组件
  onRouteRegistered?: (route: RouteConfig) => void
}

export class DynamicRouter {
  constructor(private options: DynamicRouterOptions) {}
  
  async registerRoute(config: RouteConfig) {
    // 只处理路由注册，不直接渲染
    router.addRoute({
      path: config.path,
      component: this.options.pageComponent  // 使用注入的组件
    })
    
    this.options.onRouteRegistered?.(config)
  }
}

// 主应用中连接
const dynamicRouter = new DynamicRouter({
  pageComponent: PageRenderer,  // 注入 L3 组件
  onRouteRegistered: (route) => {
    console.log('Route registered:', route)
  }
})
```

### 场景 3: 需要跨层通信

**错误做法**：
```typescript
// ❌ L1 直接访问 L3 数据
import { PageRenderer } from '@spark-view/spark-renderer'

function getPageData() {
  return PageRenderer.currentPageData  // 错误！
}
```

**正确做法**：
```typescript
// ✅ 通过事件总线或状态管理
// L1: 定义事件接口
export interface AppEvents {
  'page:loaded': (pageId: string, data: unknown) => void
  'page:error': (error: Error) => void
}

export class EventBus {
  private listeners = new Map()
  
  on<K extends keyof AppEvents>(
    event: K,
    handler: AppEvents[K]
  ): void {
    // ...
  }
  
  emit<K extends keyof AppEvents>(
    event: K,
    ...args: Parameters<AppEvents[K]>
  ): void {
    // ...
  }
}

// L3: 发射事件
export class PageRenderer {
  async loadPage(pageId: string) {
    const data = await this.fetchData(pageId)
    eventBus.emit('page:loaded', pageId, data)  // 发射事件
  }
}

// L1: 监听事件
eventBus.on('page:loaded', (pageId, data) => {
  logger.info(`Page ${pageId} loaded with data`, data)
})
```

## 🎯 最佳实践总结

1. **依赖注入优于直接实例化**
   - 使用构造函数注入
   - 使用配置对象注入
   - 避免在类内部 new 依赖对象

2. **接口优于具体类**
   - 依赖抽象接口，不依赖具体实现
   - 使用 TypeScript 的 interface 定义契约

3. **事件优于直接调用**
   - 使用回调函数
   - 使用事件总线
   - 使用观察者模式

4. **配置优于硬编码**
   - 通过配置对象传递依赖
   - 使用工厂函数创建实例
   - 支持依赖替换和 Mock

5. **单向数据流**
   - 数据从上往下流
   - 事件从下往上冒泡
   - 避免双向依赖

---

**维护者**: SPARK 架构团队  
**最后更新**: 2026-02-02  
**版本**: 1.0.0
