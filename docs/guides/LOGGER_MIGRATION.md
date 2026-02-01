# 日志系统迁移指南

从原始 `console` 调用迁移到统一的应用层日志系统。

## 迁移概览

### 当前状态
- ✅ 核心系统已使用 `@spark-view/spark-core` 的 Logger
- ❌ 应用代码大量使用原始 `console.log/warn/error`
- ❌ 缺乏统一的日志级别控制
- ❌ 日志格式不一致

### 目标状态
- ✅ 全部使用统一的 `logger` API
- ✅ 支持日志级别过滤
- ✅ 语义化的日志方法
- ✅ 模块化的日志前缀

## 快速替换模式

### 基础替换

```typescript
// ❌ 旧代码
import console from 'console'
console.log('消息')
console.warn('警告')
console.error('错误')

// ✅ 新代码
import { logger } from '@/utils/logger'
logger.info('消息')
logger.warn('警告')
logger.error('错误')
```

### Emoji 替换

```typescript
// ❌ 旧代码
console.log('✅ 操作成功')
console.log('⚠️ 警告信息')
console.log('❌ 错误信息')
console.log('📡 API 请求')
console.log('🔄 数据同步')
console.log('🎯 事件触发')

// ✅ 新代码
logger.success('操作成功')
logger.warn('警告信息')
logger.error('错误信息')
logger.api('API 请求')
logger.sync('数据同步')
logger.event('事件触发')
```

## 文件级迁移清单

### 高优先级文件

#### 1. src/views/DynamicPage.vue
```typescript
// 文件顶部添加
import { pageLogger as logger } from '@/utils/logger'

// 替换示例
// console.log('✅ DataSet 自动初始化成功（内核级）')
logger.success('DataSet 自动初始化成功（内核级）')

// console.log(`📡 加载 API 数据 [${key}]:`, fetchUrl)
logger.api(`加载 API 数据 [${key}]`, fetchUrl)

// console.log(`🔄 [${immediate ? 'Immediate' : 'Debounce'}] 重新绑定数据到 rules`)
logger.sync(`[${immediate ? 'Immediate' : 'Debounce'}] 重新绑定数据到 rules`)

// console.log(`🎯 [事件触发] ${eventName} -> ${handler}`, args)
logger.event(`[事件触发] ${eventName} -> ${handler}`, args)

// console.warn(`⚠️ 渲染函数 ${newRule.type} 未找到`)
logger.warn(`渲染函数 ${newRule.type} 未找到`)

// console.error('❌ 获取页面配置失败:', err)
logger.error('获取页面配置失败', err)
```

#### 2. src/services/page-config.ts
```typescript
// 文件顶部添加
import { apiLogger as logger } from '@/utils/logger'

// 替换示例
// console.info(`📦 SPA模式：直接加载页面配置 ${pageId}`)
logger.package(`SPA模式：直接加载页面配置 ${pageId}`)

// console.error(`❌ 无法加载页面配置: ${pageId}`, importError)
logger.error(`无法加载页面配置: ${pageId}`, importError)
```

### 中优先级文件

#### 3. features/ 组件
```typescript
// 组件中使用
import { logger } from '@/utils/logger'

// 或创建模块专用 logger
const componentLogger = logger.createChild('ComponentName')

componentLogger.info('组件初始化')
componentLogger.data('数据更新', newData)
```

### 低优先级文件

#### 4. tools/ 脚本
```typescript
// 工具脚本可以使用默认 logger
import { logger } from '@/utils/logger'

// 或 Spark 核心 Logger（如果不需要应用层功能）
import { Spark } from '@spark-view/spark-core'
const logger = Spark.Logger()
```

## 批量替换命令

### PowerShell 查找需要迁移的文件

```powershell
# 查找所有使用 console 的文件
Get-ChildItem -Path "src","features" -Include "*.ts","*.vue" -Recurse | 
  Select-String -Pattern "console\.(log|info|warn|error)" | 
  Group-Object Path | 
  Select-Object Name, Count

# 统计每个文件的 console 使用次数
Get-ChildItem -Path "src" -Filter "*.vue" -Recurse | 
  ForEach-Object {
    $count = (Select-String -Path $_.FullName -Pattern "console\.(log|info|warn|error)").Count
    if ($count -gt 0) {
      [PSCustomObject]@{
        File = $_.FullName
        Count = $count
      }
    }
  } | Sort-Object -Property Count -Descending
```

### VS Code 批量替换

1. **查找**: `console\.log\('(✅|⏳|📊|📡|🔄|🎯|🔧|📦)`
2. **替换为**: `logger.success('` (根据 emoji 类型调整)

## 迁移检查清单

### 文件级检查

- [ ] 添加 logger 导入
- [ ] 替换所有 console 调用
- [ ] 移除 Emoji 前缀（改用语义化方法）
- [ ] 调整日志级别（info/debug/warn/error）
- [ ] 添加适当的上下文信息

### 项目级检查

- [ ] src/views/*.vue
- [ ] src/services/*.ts
- [ ] src/utils/*.ts
- [ ] features/**/*.vue
- [ ] features/**/*.ts

### 验证步骤

```bash
# 1. 运行测试
pnpm test

# 2. 类型检查
pnpm run typecheck

# 3. Lint 检查
pnpm run lint

# 4. 开发环境验证
pnpm run dev
# 打开浏览器控制台，查看日志输出
```

## 常见场景

### 场景 1: 调试日志

```typescript
// ❌ 旧代码
console.log('🔍 [Debug] dataKey=', value)

// ✅ 新代码
logger.debug('[Debug] dataKey=', value)
```

### 场景 2: 条件日志

```typescript
// ❌ 旧代码
if (config.debug) {
  console.log('详细信息', data)
}

// ✅ 新代码
logger.debug('详细信息', data)  // 自动根据级别过滤
```

### 场景 3: 错误处理

```typescript
// ❌ 旧代码
try {
  // ...
} catch (err) {
  console.error('❌ 操作失败:', err)
}

// ✅ 新代码
try {
  // ...
} catch (err) {
  logger.error('操作失败', err)
}
```

### 场景 4: 进度日志

```typescript
// ❌ 旧代码
console.log('⏳ 加载中...')
// ... 异步操作 ...
console.log('✅ 加载完成')

// ✅ 新代码
logger.loading('加载中...')
// ... 异步操作 ...
logger.success('加载完成')
```

## 迁移时间表

### Phase 1: 核心文件（Week 1）
- [ ] src/views/DynamicPage.vue
- [ ] src/services/page-config.ts
- [ ] src/router/index.ts

### Phase 2: 工具文件（Week 2）
- [ ] src/utils/**/*.ts
- [ ] src/types/**/*.ts

### Phase 3: 功能模块（Week 3）
- [ ] features/spark-ej2/**/*.vue
- [ ] features/renderers/**/*.vue
- [ ] features/spark/**/*.vue

### Phase 4: 测试和优化（Week 4）
- [ ] 全面测试
- [ ] 性能优化
- [ ] 文档更新

## 性能考虑

### 避免过度日志

```typescript
// ❌ 性能问题
items.forEach(item => {
  logger.debug('处理项目', item)  // 循环中的日志
})

// ✅ 优化后
logger.debug('批量处理项目', { count: items.length })
```

### 使用合适的日志级别

```typescript
// ❌ 不当使用
logger.info('循环迭代', index)  // 频繁日志应该用 debug

// ✅ 正确使用
logger.debug('循环迭代', index)  // 生产环境会被过滤
logger.info('处理完成', { total: items.length })  // 关键信息
```

## FAQ

### Q: 什么时候使用 logger vs Spark.Logger()?

**A**: 
- **应用层代码** (src/, features/) → 使用 `logger` (src/utils/logger)
- **核心库代码** (packages/) → 使用 `Spark.Logger()` (@spark-view/spark-core)

### Q: 如何在生产环境禁用 debug 日志?

**A**:
```typescript
// 在 src/main.ts 或入口文件
import { logger } from '@/utils/logger'

if (import.meta.env.PROD) {
  logger.setLevel('info')  // 生产环境只显示 info 及以上
}
```

### Q: 可以自定义日志格式吗?

**A**: 可以通过配置选项:
```typescript
logger.setConfig({
  showTimestamp: true,     // 显示时间戳
  enableColors: false,     // 禁用颜色
  prefix: 'MyApp'          // 添加前缀
})
```

### Q: 如何为不同模块设置不同日志级别?

**A**: 创建模块专用 logger:
```typescript
const authLogger = createLogger({ prefix: 'Auth', level: 'debug' })
const apiLogger = createLogger({ prefix: 'API', level: 'info' })
```

## 相关资源

- [Logger API 文档](./README_LOGGER.md)
- [@spark-view/spark-core Logger](../../packages/spark-core/API.md#日志系统)
- [测试示例](../../tests/app-logger.test.ts)
