# 统一日志系统

应用层统一日志服务，基于 `@spark-view/spark-core` 的 Logger。

## 特性

- ✅ **统一接口** - 全局一致的日志 API
- ✅ **级别控制** - 支持 debug/info/warn/error 级别过滤
- ✅ **彩色输出** - 浏览器控制台彩色日志
- ✅ **Emoji 图标** - 语义化的 emoji 前缀
- ✅ **环境适配** - 开发/生产环境自动配置
- ✅ **子 Logger** - 支持带前缀的模块化日志

## 快速开始

### 基础用法

```typescript
import { logger } from '@/utils/logger'

// 基础日志
logger.debug('调试信息', { data: 123 })
logger.info('信息日志')
logger.warn('警告信息')
logger.error('错误信息', error)

// 语义化日志（带 Emoji）
logger.success('✅ 操作成功')
logger.loading('⏳ 加载中...')
logger.data('📊 数据更新', newData)
logger.api('📡 API 请求', url)
logger.event('🎯 事件触发', event)
logger.sync('🔄 数据同步')
logger.inject('🔧 依赖注入')
logger.package('📦 加载模块')
```

### 预配置实例

```typescript
import { pageLogger, apiLogger, dataLogger } from '@/utils/logger'

// 页面日志（自动带 [Page] 前缀）
pageLogger.info('页面加载完成')

// API 日志（自动带 [API] 前缀）
apiLogger.api('请求用户数据', '/api/users')

// 数据日志（自动带 [Data] 前缀）
dataLogger.data('DataSet 更新', dataset)
```

### 创建自定义 Logger

```typescript
import { createLogger } from '@/utils/logger'

// 创建模块专用 Logger
const componentLogger = createLogger({
  prefix: 'Component',
  level: 'debug',
  enableColors: true
})

componentLogger.info('组件初始化')
```

### 子 Logger

```typescript
import { logger } from '@/utils/logger'

const gridLogger = logger.createChild('Grid')
const columnLogger = gridLogger.createChild('Column')

gridLogger.info('Grid 渲染')        // [Grid] Grid 渲染
columnLogger.debug('列定义更新')     // [Grid:Column] 列定义更新
```

## 日志级别

### 级别优先级

```
debug < info < warn < error
```

### 环境配置

```typescript
// 开发环境：默认 'debug' - 显示所有日志
// 生产环境：默认 'info' - 只显示 info/warn/error
```

### 动态调整

```typescript
import { logger } from '@/utils/logger'

// 运行时调整级别
logger.setLevel('warn')  // 只显示 warn 和 error

// 更新配置
logger.setConfig({
  level: 'debug',
  showTimestamp: true
})
```

## API 参考

### 基础方法

```typescript
logger.debug(message: string, ...args: unknown[]): void
logger.info(message: string, ...args: unknown[]): void
logger.warn(message: string, ...args: unknown[]): void
logger.error(message: string, ...args: unknown[]): void
```

### 语义化方法

```typescript
logger.success(message: string, ...args: unknown[]): void   // ✅
logger.loading(message: string, ...args: unknown[]): void   // ⏳
logger.data(message: string, ...args: unknown[]): void      // 📊
logger.api(message: string, ...args: unknown[]): void       // 📡
logger.event(message: string, ...args: unknown[]): void     // 🎯
logger.sync(message: string, ...args: unknown[]): void      // 🔄
logger.inject(message: string, ...args: unknown[]): void    // 🔧
logger.package(message: string, ...args: unknown[]): void   // 📦
```

### 自定义 Emoji

```typescript
logger.withEmoji('🚀', 'info', 'App started')
```

### 配置方法

```typescript
logger.setLevel(level: LogLevel): void
logger.setConfig(config: Partial<LogConfig>): void
logger.createChild(prefix: string): AppLogger
```

## 迁移指南

### 从 console 迁移

```typescript
// ❌ 旧代码
console.log('✅ 数据加载成功', data)
console.warn('⚠️ 警告信息')
console.error('❌ 错误信息', error)

// ✅ 新代码
logger.success('数据加载成功', data)
logger.warn('警告信息')
logger.error('错误信息', error)
```

### 语义化重构

```typescript
// ❌ 旧代码
console.log('📡 加载 API 数据:', url)
console.log('🔄 重新绑定数据')
console.log('🎯 事件触发:', event)

// ✅ 新代码
logger.api('加载 API 数据', url)
logger.sync('重新绑定数据')
logger.event('事件触发', event)
```

## 配置选项

```typescript
interface LogConfig {
  level?: 'debug' | 'info' | 'warn' | 'error'  // 最小日志级别
  enableColors?: boolean                        // 启用彩色输出
  showTimestamp?: boolean                       // 显示时间戳
  prefix?: string                               // 日志前缀
}
```

## 最佳实践

### 1. 使用语义化方法

```typescript
// ✅ 推荐
logger.success('用户登录成功')
logger.api('请求用户列表')
logger.event('按钮点击')

// ❌ 不推荐
logger.info('✅ 用户登录成功')
logger.info('📡 请求用户列表')
logger.debug('🎯 按钮点击')
```

### 2. 使用模块前缀

```typescript
// ✅ 推荐 - 创建模块专用 Logger
const authLogger = logger.createChild('Auth')
authLogger.info('登录验证')  // [Auth] 登录验证

// ❌ 不推荐 - 在消息中手动添加前缀
logger.info('[Auth] 登录验证')
```

### 3. 合理选择级别

```typescript
// ✅ 正确使用
logger.debug('详细的调试信息', complexObject)  // 开发时查看
logger.info('用户操作记录')                  // 正常流程
logger.warn('非致命警告')                    // 需要注意
logger.error('严重错误', error)              // 错误处理

// ❌ 错误使用
logger.info('循环中的日志')  // 应该用 debug
logger.error('非错误的警告')  // 应该用 warn
```

### 4. 提供上下文信息

```typescript
// ✅ 提供足够的上下文
logger.error('API 请求失败', {
  url: '/api/users',
  status: 500,
  error: error.message
})

// ❌ 信息不足
logger.error('请求失败')
```

## 与核心 Logger 的关系

```
@spark-view/spark-core
  └── Logger()              # 核心日志接口
       └── @/utils/logger   # 应用层封装
            ├── AppLogger   # 增强功能
            │   ├── 级别过滤
            │   ├── 彩色输出
            │   ├── Emoji 图标
            │   └── 前缀管理
            └── 预配置实例
                ├── logger
                ├── pageLogger
                ├── apiLogger
                └── dataLogger
```

## 性能考虑

### 日志级别过滤

```typescript
// ✅ 高效 - 级别检查在格式化之前
if (logger.shouldLog('debug')) {
  logger.debug('调试信息', expensiveOperation())
}

// 生产环境中，debug 日志不会执行 expensiveOperation()
```

### 避免频繁日志

```typescript
// ❌ 不推荐 - 在循环中记录日志
for (const item of items) {
  logger.debug('处理项目', item)  // 性能问题
}

// ✅ 推荐 - 批量记录
logger.debug('批量处理项目', { count: items.length, items })
```

## 故障排除

### 日志未显示

1. 检查日志级别设置
2. 确认环境变量配置
3. 查看浏览器控制台过滤器

### 彩色输出不生效

1. 确保在浏览器环境
2. 检查 `enableColors` 配置
3. 某些终端不支持彩色输出

### 性能问题

1. 调整日志级别（生产环境使用 'info' 或更高）
2. 避免在循环中记录日志
3. 使用条件日志检查

## 相关文档

- [@spark-view/spark-core Logger API](../../packages/spark-core/API.md#日志系统)
- [项目最佳实践](../../docs/development/BEST_PRACTICES.md)
