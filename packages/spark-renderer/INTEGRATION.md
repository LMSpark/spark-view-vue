# L3 对接 L1 和 L2 集成指南

本文档说明 L3 (页面渲染层) 如何使用 L1 (应用层) 和 L2 (页面配置层) 提供的能力。

## 架构依赖关系

```
L1 (spark-app) - 应用基础设施层
    ├── Logger (pageLogger)
    ├── Constants (ErrorCodes, DefaultConfig)
    └── AppContext
        ↓
L2 (spark-page-config) - 业务编排层
    ├── ConfigLoader (加载配置)
    └── DynamicRouter (动态路由)
        ↓
L3 (spark-renderer) - 页面渲染层
    ├── PageRenderer (使用 L1 Logger + L2 ConfigLoader)
    ├── usePageDataSet (使用 L1 Logger)
    ├── useScriptSandbox (使用 L1 Logger)
    ├── useRuleBinding (使用 L1 Logger)
    └── Utils (使用 L1 Logger)
```

## 1. PageRenderer 对接 L1 和 L2

### 1.1 使用 L1 Logger

```vue
<script setup lang="ts">
import { pageLogger, ErrorCodes, getErrorMessage } from '@spark-view/spark-app'

// 页面加载开始
pageLogger.info('开始加载页面', { pageId, route: route.fullPath })

// 配置加载成功
pageLogger.success('页面配置加载成功', { pageId })

// 页面渲染完成
pageLogger.success('页面渲染完成', { pageId })

// 错误处理
pageLogger.error('页面加载失败', { pageId, error })
</script>
```

### 1.2 使用 L1 ErrorCodes

```typescript
// 无法确定页面ID
if (!pageId) {
  const errorMsg = getErrorMessage(ErrorCodes.CONFIG_INVALID)
  pageLogger.error('无法确定页面ID', { route: route.fullPath })
  throw new Error(`${errorMsg}: 无法确定页面ID`)
}

// 配置加载失败
if (!result.success || !result.data) {
  const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
  pageLogger.error('配置加载失败', { pageId, error: result.error })
  throw new Error(`${errorMsg}: ${result.error}`)
}
```

### 1.3 使用 L2 ConfigLoader

```typescript
// 从 configLoader 加载配置
if (props.configLoader) {
  pageLogger.debug('从 configLoader 加载配置', { pageId })
  const result = await props.configLoader.loadPageConfig(pageId)
  
  if (!result.success || !result.data) {
    const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
    throw new Error(`${errorMsg}: ${result.error}`)
  }
  
  config = result.data
}
```

### 1.4 完整的加载流程

```typescript
const loadPageConfig = async () => {
  loading.value = true
  error.value = ''
  
  try {
    // 1. 确定页面ID
    const pageId = props.pageId || route.meta.pageId || route.name
    pageLogger.info('开始加载页面', { pageId, route: route.fullPath })
    
    // 2. beforeLoad 钩子
    if (props.beforeLoad) {
      pageLogger.debug('执行 beforeLoad 钩子', { pageId })
      await props.beforeLoad(pageId)
    }
    
    // 3. 加载配置（使用 L2 ConfigLoader）
    pageLogger.debug('从 configLoader 加载配置', { pageId })
    const result = await props.configLoader.loadPageConfig(pageId)
    pageLogger.success('页面配置加载成功', { pageId })
    
    // 4. 处理页面数据
    Object.assign(pageData, config.data)
    
    // 5. 设置样式
    if (config.style) {
      pageLogger.debug('设置页面样式', { pageId })
      setScopedCss(config.style)
    }
    
    // 6. 初始化 DataSet
    pageLogger.debug('初始化 DataSet', { pageId })
    initDataSet()
    
    // 7. 加载脚本
    if (props.enableScriptSandbox) {
      pageLogger.debug('加载页面脚本', { pageId })
      await loadScript()
    }
    
    // 8. 自动订阅表
    pageLogger.debug('自动订阅表', { pageId })
    autoSubscribeTables()
    
    // 9. 绑定 rules
    pageLogger.debug('绑定 rules', { pageId, rulesCount: originalRules.value.length })
    rebindRules()
    
    // 10. afterLoad 钩子
    if (props.afterLoad) {
      pageLogger.debug('执行 afterLoad 钩子', { pageId })
      await props.afterLoad(config)
    }
    
    pageLogger.success('页面渲染完成', { pageId })
    loading.value = false
  } catch (err) {
    pageLogger.error('页面加载失败', { pageId, error: err })
    error.value = err.message
    loading.value = false
  }
}
```

## 2. usePageDataSet 对接 L1

### 2.1 使用 L1 Logger

```typescript
import { pageLogger } from '@spark-view/spark-app'

// DataSet 初始化
pageLogger.debug('DataSet 初始化成功', { 
  tables: Object.keys(dataSet.value.tables || {}) 
})

// 默认 dataLoader 警告
pageLogger.warn('使用默认 dataLoader，页面脚本应该注册自定义 dataLoader', { tableName })

// 上下文订阅
pageLogger.debug('自动订阅上下文', { contextKey })
pageLogger.debug('上下文数据变化', { contextKey })
```

## 3. useScriptSandbox 对接 L1

### 3.1 使用 L1 Logger

```typescript
import { pageLogger } from '@spark-view/spark-app'

// 脚本加载成功
pageLogger.debug('页面脚本加载成功', {
  pageId,
  functions: Object.keys(module)
})

// 脚本加载失败
pageLogger.warn('页面脚本加载失败', { pageId, error })

// 函数不存在
pageLogger.warn('函数不存在', { name, pageId })
```

## 4. Utils 对接 L1

### 4.1 createSandbox.ts

```typescript
import { pageLogger } from '@spark-view/spark-app'

// 脚本执行错误
pageLogger.error('脚本执行错误', { error })

// 无法加载脚本
pageLogger.warn('无法加载页面脚本', { url, error })
```

### 4.2 bindRules.ts

```typescript
import { pageLogger } from '@spark-view/spark-app'

// 函数未定义
pageLogger.warn('函数未定义', { handlerName })
```

### 4.3 useRuleBinding.ts

```typescript
import { pageLogger } from '@spark-view/spark-app'

// Rules 重新绑定
pageLogger.debug('Rules 重新绑定', { rulesCount: originalRules.value.length })
```

## 5. 修改统计

### 修改文件列表

1. ✅ `PageRenderer.vue` - 添加 L1 Logger 和 ErrorCodes 集成
2. ✅ `usePageDataSet.ts` - 使用 pageLogger 替换 console.log
3. ✅ `useScriptSandbox.ts` - 使用 pageLogger 替换 console.log
4. ✅ `useRuleBinding.ts` - 使用 pageLogger 替换 console.log
5. ✅ `createSandbox.ts` - 使用 pageLogger 替换 console
6. ✅ `bindRules.ts` - 使用 pageLogger 替换 console.warn

### 日志记录统计

- PageRenderer: 15+ 条日志
- usePageDataSet: 6+ 条日志
- useScriptSandbox: 3+ 条日志
- useRuleBinding: 1+ 条日志
- Utils: 3+ 条日志

**总计**: 28+ 条日志记录

## 6. 集成效果

### 日志输出示例

```
[PAGE] INFO  开始加载页面 { pageId: "home", route: "/home" }
[PAGE] DEBUG 执行 beforeLoad 钩子 { pageId: "home" }
[PAGE] DEBUG 从 configLoader 加载配置 { pageId: "home" }
[PAGE] SUCCESS 页面配置加载成功 { pageId: "home" }
[PAGE] DEBUG 设置页面样式 { pageId: "home", hasStyle: true }
[PAGE] DEBUG 初始化 DataSet { pageId: "home" }
[PAGE] DEBUG DataSet 初始化成功 { tables: ["Users", "Orders"] }
[PAGE] DEBUG 加载页面脚本 { pageId: "home" }
[PAGE] DEBUG 页面脚本加载成功 { pageId: "home", functions: ["handleClick", "loadData"] }
[PAGE] DEBUG 自动订阅表 { pageId: "home" }
[PAGE] DEBUG 自动订阅上下文 { contextKey: "Users.main" }
[PAGE] DEBUG 绑定 rules { pageId: "home", rulesCount: 15 }
[PAGE] DEBUG Rules 重新绑定 { rulesCount: 15 }
[PAGE] DEBUG FormCreate 挂载完成 { pageId: "home" }
[PAGE] DEBUG 执行 afterLoad 钩子 { pageId: "home" }
[PAGE] SUCCESS 页面渲染完成 { pageId: "home" }
```

### 错误处理示例

```
[PAGE] ERROR 无法确定页面ID { route: "/invalid" }
  → Error: 配置无效: 无法确定页面ID

[PAGE] ERROR 配置加载失败 { pageId: "home", error: "网络超时" }
  → Error: 配置加载失败: 网络超时

[PAGE] WARN  页面脚本加载失败 { pageId: "home", error: ... }
  → 页面继续渲染，但脚本功能不可用
```

## 7. 使用示例

### 7.1 在主应用中使用

```typescript
import { createApp } from 'vue'
import { createRouter } from 'vue-router'
import { createAppContext } from '@spark-view/spark-app'
import { PageConfigLoader } from '@spark-view/spark-page-config'
import { PageRenderer } from '@spark-view/spark-renderer'

const app = createApp(App)
const router = createRouter({ ... })

// 1. 创建 L1 AppContext
const appContext = createAppContext({
  appId: 'my-app',
  environment: 'production'
})
app.provide(APP_CONTEXT_KEY, appContext)

// 2. 创建 L2 ConfigLoader
const configLoader = new PageConfigLoader({
  source: 'hybrid',
  apiBaseUrl: '/api',
  enableCache: true
})

// 3. 使用 L3 PageRenderer
const DynamicPage = defineComponent({
  setup() {
    return () => h(PageRenderer, {
      configLoader, // 传入 L2 ConfigLoader
      enableDataSet: true,
      enableScriptSandbox: true,
      enableCssScope: true
    })
  }
})

// 4. 注册路由
router.addRoute({
  path: '/:id',
  component: DynamicPage,
  meta: { dynamic: true }
})

app.use(router)
app.mount('#app')
```

### 7.2 日志分层

L1 Logger 提供了不同的日志实例：
- `pageLogger` - 页面相关日志（L2 和 L3 使用）
- `routerLogger` - 路由相关日志（L2 使用）
- `appLogger` - 应用级日志（L1 使用）

L3 统一使用 `pageLogger`，所有日志都带有 `[PAGE]` 前缀。

## 8. 集成优势

1. **统一日志格式** - 所有 L3 日志使用 L1 的 pageLogger
2. **统一错误码** - 使用 L1 的 ErrorCodes（CONFIG_INVALID, CONFIG_LOAD_FAILED）
3. **依赖 L2 加载配置** - 通过 ConfigLoader 加载页面配置
4. **完整的生命周期日志** - 从加载到渲染的每一步都有日志
5. **可追溯性强** - 所有操作都带上下文信息（pageId, route 等）
6. **错误处理标准化** - 统一使用 getErrorMessage + 日志 + 抛出错误

## 9. 最佳实践

1. **日志级别选择**
   - `debug` - 详细的执行步骤（如"加载脚本"、"绑定 rules"）
   - `info` - 重要的操作开始（如"开始加载页面"）
   - `success` - 操作成功完成（如"页面渲染完成"）
   - `warn` - 非致命错误（如"脚本加载失败"）
   - `error` - 致命错误（如"配置加载失败"）

2. **日志信息要包含上下文**
   ```typescript
   // ✅ 好的日志
   pageLogger.debug('加载页面脚本', { pageId, functions })
   
   // ❌ 差的日志
   pageLogger.debug('加载脚本')
   ```

3. **错误处理流程**
   ```typescript
   // 1. 记录日志
   pageLogger.error('配置加载失败', { pageId, error })
   
   // 2. 使用标准错误码
   const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
   
   // 3. 抛出错误
   throw new Error(`${errorMsg}: ${error}`)
   ```

4. **配置加载优先使用 L2**
   ```typescript
   // ✅ 推荐：使用 L2 ConfigLoader
   const result = await props.configLoader.loadPageConfig(pageId)
   
   // ⚠️ 可选：直接传入配置
   const config = props.pageConfig
   ```

## 10. 下一步

- [ ] 主应用集成新的 L3 包
- [ ] 完善错误边界处理
- [ ] 添加性能监控（加载时间）
- [ ] 完善单元测试
