# Logger 架构分层说明

## 📊 分层设计

### **Core 层 Logger**（`@spark-view/spark-core`）

**职责**：
- 提供底层日志接口（`LoggerApi`）
- 提供基础 `Logger()` 函数
- 组件系统内部使用
- 最小化依赖，轻量级实现

**使用场景**：
```typescript
// 组件内部使用
import { Logger } from '@spark-view/spark-core'

const logger = Logger(context)
logger.debug('组件初始化')
```

---

### **App 层 Logger**（`@spark-view/spark-app`）

**职责**：
- 应用级日志配置（级别、格式、颜色）
- 日志上报（生产环境发送到后端）
- 日志聚合与格式化
- 作用域 Logger（page、api、router）
- 日志传输器管理

**使用场景**：
```typescript
// 应用层统一配置
import { createAppLogger, pageLogger } from '@spark-view/spark-app'

const logger = createAppLogger({
  level: 'debug',
  enableRemote: true
})

// 作用域日志
pageLogger.info('页面加载完成')
apiLogger.error('API 请求失败', error)
```

---

## 🎯 职责对比

| 特性 | Core Logger | App Logger |
|-----|------------|------------|
| **基础日志** | ✅ debug/info/warn/error | ✅ 继承 Core |
| **日志级别** | ❌ 无过滤 | ✅ 可配置级别 |
| **格式化** | ⚠️ 简单格式 | ✅ 时间戳/前缀/Emoji |
| **颜色** | ❌ 无 | ✅ 可配置 |
| **远程上报** | ❌ 无 | ✅ HTTP 传输器 |
| **作用域** | ❌ 无 | ✅ page/api/router |
| **传输器** | ⚠️ 基础传输器 | ✅ 可扩展传输器 |
| **使用场景** | 组件内部 | 应用层、页面、业务 |

---

## 🔄 调用链路

```
┌──────────────────────────────────────┐
│ 页面/业务代码                         │
│                                      │
│ pageLogger.info('加载完成')          │
└─────────────┬────────────────────────┘
              │
              ↓
┌──────────────────────────────────────┐
│ App Logger (spark-app)               │
│                                      │
│ 1. 检查日志级别                       │
│ 2. 格式化消息                         │
│ 3. 调用 Core Logger                  │
│ 4. 触发传输器（HTTP/自定义）          │
└─────────────┬────────────────────────┘
              │
              ↓
┌──────────────────────────────────────┐
│ Core Logger (spark-core)             │
│                                      │
│ 1. 输出到 console                    │
│ 2. 简单格式化                         │
└──────────────────────────────────────┘
```

---

## 📝 使用示例

### **1. 应用初始化时配置**

```typescript
// main.ts
import { SparkApp, createAppLogger } from '@spark-view/spark-app'

// 配置全局 Logger
const logger = createAppLogger({
  level: import.meta.env.PROD ? 'warn' : 'debug',
  enableRemote: import.meta.env.PROD,
  remoteEndpoint: '/api/logs'
})

SparkApp.bootstrap({
  app,
  router,
  config: {
    logger
  }
})
```

### **2. 页面中使用**

```typescript
// Page.vue
import { pageLogger } from '@spark-view/spark-app'

pageLogger.info('页面加载', { pageId: route.params.id })
pageLogger.error('数据加载失败', error)
pageLogger.success('保存成功')
```

### **3. 组件内部使用 Core Logger**

```typescript
// SparkComponent.vue
import { Logger } from '@spark-view/spark-core'

const logger = Logger(context)
logger.debug('组件挂载', { id: context.id })
```

### **4. 自定义传输器**

```typescript
import { createAppLogger, LogTransport } from '@spark-view/spark-app'

// 自定义 Sentry 传输器
const sentryTransport: LogTransport = {
  send(level, message, meta) {
    if (level === 'error') {
      Sentry.captureException(new Error(message), { extra: meta })
    }
  }
}

const logger = createAppLogger()
logger.addTransport(sentryTransport)
```

---

## ✅ 总结

**设计原则**：
- **Core**：最小化、轻量级、组件内部使用
- **App**：功能丰富、可配置、应用层使用
- **分层清晰**：Core 提供基础能力，App 提供增强能力
- **依赖方向**：App → Core（单向依赖）

**迁移指南**：
- 组件内部继续使用 `@spark-view/spark-core` 的 `Logger()`
- 应用层、页面、业务代码使用 `@spark-view/spark-app` 的 `pageLogger` 等
- 保持现有代码兼容，逐步迁移
