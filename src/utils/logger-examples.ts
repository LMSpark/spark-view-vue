/**
 * 日志系统使用示例
 * 
 * 演示如何在应用中使用统一的日志 API
 */

import { logger, pageLogger, apiLogger, dataLogger, createLogger } from '@/utils/logger'

/**
 * 示例 1: 基础日志使用
 */
export function basicLoggingExample() {
  // 不同级别的日志
  logger.debug('这是调试信息', { detail: 'some data' })
  logger.info('这是普通信息')
  logger.warn('这是警告信息')
  logger.error('这是错误信息', new Error('Something went wrong'))
}

/**
 * 示例 2: 语义化日志
 */
export function semanticLoggingExample() {
  // 操作成功
  logger.success('用户登录成功')
  
  // 加载状态
  logger.loading('正在加载用户数据...')
  
  // API 请求
  logger.api('GET /api/users', { params: { page: 1 } })
  
  // 数据操作
  logger.data('DataSet 更新', { tableName: 'Users', rowCount: 100 })
  
  // 事件触发
  logger.event('按钮点击', { buttonId: 'submit', userId: 123 })
  
  // 数据同步
  logger.sync('UI 与 DataSet 同步完成')
  
  // 依赖注入
  logger.inject('注入 UserService 依赖')
  
  // 模块加载
  logger.package('加载 AuthModule')
}

/**
 * 示例 3: 使用预配置 Logger
 */
export function predefinedLoggersExample() {
  // 页面日志 (带 [Page] 前缀)
  pageLogger.info('页面初始化完成')
  pageLogger.success('表单数据加载成功')
  
  // API 日志 (带 [API] 前缀)
  apiLogger.api('请求用户列表', '/api/users')
  apiLogger.error('API 请求失败', { status: 500 })
  
  // 数据日志 (带 [Data] 前缀)
  dataLogger.data('Table 数据更新', { count: 50 })
  dataLogger.sync('currentRow 同步完成')
}

/**
 * 示例 4: 创建模块专用 Logger
 */
export function moduleLoggerExample() {
  // 为 Grid 组件创建专用 logger
  const gridLogger = logger.createChild('Grid')
  
  gridLogger.info('Grid 组件初始化')
  gridLogger.data('加载 100 行数据')
  gridLogger.event('行选择变化', { selectedRows: [1, 2, 3] })
  
  // 为 Column 创建子 logger
  const columnLogger = gridLogger.createChild('Column')
  
  columnLogger.debug('Column 配置更新')  // 输出: [Grid:Column] Column 配置更新
}

/**
 * 示例 5: 自定义配置
 */
export function customConfigExample() {
  // 创建自定义配置的 logger
  const customLogger = createLogger({
    prefix: 'MyModule',
    level: 'debug',
    enableColors: true,
    showTimestamp: true
  })
  
  customLogger.info('使用自定义配置')
  
  // 运行时更新配置
  customLogger.setConfig({
    level: 'warn',
    showTimestamp: false
  })
  
  customLogger.debug('这条不会显示 (被过滤)')
  customLogger.warn('这条会显示')
}

/**
 * 示例 6: 日志级别控制
 */
export function logLevelExample() {
  // 创建 logger
  const testLogger = createLogger({ level: 'info' })
  
  testLogger.debug('Debug 信息 (不显示)')
  testLogger.info('Info 信息 (显示)')
  testLogger.warn('Warn 信息 (显示)')
  testLogger.error('Error 信息 (显示)')
  
  // 动态调整级别
  testLogger.setLevel('error')
  
  testLogger.info('现在 info 也被过滤了')
  testLogger.error('只有 error 显示')
}

/**
 * 示例 7: 错误处理中的日志
 */
export async function errorHandlingExample() {
  try {
    // 模拟 API 请求
    logger.api('请求用户数据', '/api/users')
    
    const response = await fetch('/api/users')
    
    if (!response.ok) {
      logger.warn('API 响应异常', { status: response.status })
      throw new Error('Request failed')
    }
    
    const data = await response.json()
    logger.success('数据加载成功', { count: data.length })
    logger.data('用户列表', data)
    
    return data
  } catch (error) {
    logger.error('请求失败', error)
    throw error
  }
}

/**
 * 示例 8: Vue 组件中使用
 */
export function vueComponentExample() {
  // 在 Vue 组件 <script setup> 中
  const componentLogger = logger.createChild('MyComponent')
  
  // 生命周期
  componentLogger.info('组件挂载')
  
  // 数据变化
  function onDataChange(newData: unknown) {
    componentLogger.data('数据更新', newData)
  }
  
  // 事件处理
  function handleClick(event: Event) {
    componentLogger.event('点击事件', { target: event.target })
  }
  
  // 错误处理
  function handleError(error: Error) {
    componentLogger.error('组件错误', error)
  }
  
  return {
    onDataChange,
    handleClick,
    handleError
  }
}

/**
 * 示例 9: 自定义 Emoji
 */
export function customEmojiExample() {
  logger.withEmoji('🚀', 'info', '应用启动')
  logger.withEmoji('💾', 'info', '数据保存成功')
  logger.withEmoji('🔒', 'warn', '权限不足')
  logger.withEmoji('💥', 'error', '系统崩溃')
}

/**
 * 示例 10: 条件日志
 */
export function conditionalLoggingExample() {
  const isDebugMode = import.meta.env.DEV
  
  // ❌ 不推荐：手动检查
  if (isDebugMode) {
    logger.debug('调试信息', { expensive: calculateExpensiveData() })
  }
  
  // ✅ 推荐：自动过滤
  // 如果 logger 级别是 info，debug 日志会被自动过滤，
  // calculateExpensiveData() 不会被调用
  logger.debug('调试信息', { expensive: calculateExpensiveData() })
}

/**
 * 示例 11: 性能监控
 */
export function performanceLoggingExample() {
  const perfLogger = logger.createChild('Perf')
  
  const start = performance.now()
  
  // 执行操作
  doSomeWork()
  
  const duration = performance.now() - start
  
  if (duration > 1000) {
    perfLogger.warn('操作耗时过长', { duration: `${duration.toFixed(2)}ms` })
  } else {
    perfLogger.info('操作完成', { duration: `${duration.toFixed(2)}ms` })
  }
}

/**
 * 示例 12: 批量操作日志
 */
export function batchOperationExample() {
  const batchLogger = logger.createChild('Batch')
  
  const items = [1, 2, 3, 4, 5]
  
  // ❌ 不推荐：在循环中记录每个项目
  // items.forEach(item => {
  //   batchLogger.debug('处理项目', item)
  // })
  
  // ✅ 推荐：批量记录
  batchLogger.info('开始批量处理', { count: items.length })
  
  items.forEach(item => {
    processItem(item)
  })
  
  batchLogger.success('批量处理完成', { processed: items.length })
}

// 辅助函数
function calculateExpensiveData() {
  return { result: 'expensive calculation' }
}

function doSomeWork() {
  // 模拟工作
  for (let i = 0; i < 1000000; i++) {
    // busy work
  }
}

function processItem(item: number) {
  // 处理项目
  return item * 2
}

/**
 * 完整应用示例
 */
export class UserService {
  private logger = logger.createChild('UserService')
  
  async fetchUsers() {
    this.logger.api('获取用户列表')
    
    try {
      const response = await fetch('/api/users')
      const users = await response.json()
      
      this.logger.success('用户列表加载成功', { count: users.length })
      this.logger.data('用户数据', users)
      
      return users
    } catch (error) {
      this.logger.error('加载用户失败', error)
      throw error
    }
  }
  
  async createUser(userData: unknown) {
    this.logger.loading('创建用户中...')
    
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData)
      })
      
      const user = await response.json()
      
      this.logger.success('用户创建成功', { userId: user.id })
      this.logger.event('用户创建事件', user)
      
      return user
    } catch (error) {
      this.logger.error('创建用户失败', error)
      throw error
    }
  }
}
