/**
 * SPARK 组件自动注册引导程序
 * 
 * @description
 * 使用智能加载器自动扫描和注册所有组件
 * 无需手动 import 和 register，系统自动处理
 * 
 * @example
 * ```typescript
 * import { setupAutoRegister } from './bootstrap/auto-register'
 * 
 * // 在 main.ts 中调用
 * await setupAutoRegister(app)
 * ```
 * 
 * @author SPARK Team
 * @since 1.1.0
 */

import type { App } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { AutoLoader } from '@spark-view/spark-component'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('AutoRegister')

/**
 * 设置自动组件注册
 * 
 * @param app - Vue 应用实例
 * @param options - 配置选项
 */
export async function setupAutoRegister(
  app: App,
  options: {
    /** 加载模式：all（全部加载）| demand（按需加载） */
    mode?: 'all' | 'demand'
    /** 是否显示加载进度 */
    showProgress?: boolean
  } = {}
) {
  const { mode = 'demand', showProgress = true } = options

  if (showProgress) {
    logger.info('🚀 启动组件自动注册系统...')
  }

  // 获取全局注册表
  const registry = Spark.getRegistry()

  // 创建自动加载器
  const loader = AutoLoader.create({
    // 使用 Vite 的 import.meta.glob 扫描所有 Vue 组件
    patterns: {
      // packages 目录
      ...import.meta.glob('../../packages/*/src/components/**/*.vue'),
      // features 目录
      ...import.meta.glob('../../features/**/components/**/*.vue'),
      // src/components 目录
      ...import.meta.glob('../components/**/*.vue'),
      // src/views 目录
      ...import.meta.glob('../views/**/*.vue')
    },
    
    // 同步加载的核心组件（立即使用）
    syncComponents: [
      'PageRenderer',
      'SparkComponentRenderer',
      'ErrorFallback',
      'UserGrid',
      'UserRow',
      'UserField'
    ],
    
    // 异步加载的组件（按需加载）
    asyncComponents: [
      '*EJ2*',          // Syncfusion 组件
      '*Demo',          // Demo 组件
      'JsonRenderer*',  // JSON 渲染器
      'Dashboard',      // 仪表板
      'About',          // 关于页面
      'Settings',       // 设置页面
      'Capability*',    // 能力演示
      'ComponentRenderer*',  // 组件渲染器演示
      'TenantConfig*'   // 租户配置
    ],
    
    // 文件大小阈值（KB）
    sizeThreshold: 50,
    
    // 启用自动分析
    autoAnalyze: true,
    
    // 使用全局注册表
    registry
  })

  // 根据模式加载组件
  if (mode === 'all') {
    await loader.loadAll()
  } else {
    await loader.loadOnDemand()
  }

  // 显示加载统计
  if (showProgress) {
    const stats = loader.getStats()
    logger.info('✅ 组件自动注册完成')
    logger.info(`   • 总组件数: ${stats.total}`)
    logger.info(`   • 已加载: ${stats.loaded} (同步: ${stats.sync})`)
    logger.info(`   • 待加载: ${stats.pending} (异步: ${stats.async})`)
  }

  // 将 loader 挂载到 app 上，供后续使用
  app.provide('spark:autoLoader', loader)

  return loader
}

/**
 * 手动加载组件（用于按需加载场景）
 * 
 * @example
 * ```typescript
 * // 在组件中按需加载
 * import { loadComponent } from '@/bootstrap/auto-register'
 * 
 * const MyComponent = await loadComponent('my-component')
 * ```
 */
export async function loadComponent(name: string) {
  const registry = Spark.getRegistry()
  
  // 先检查是否已注册
  const component = registry.get(name)
  if (component) {
    return component
  }

  // 如果未注册，尝试加载
  logger.info(`📦 按需加载组件: ${name}`)
  
  // 这里可以扩展为动态导入
  // 目前返回 null，让调用方处理
  logger.warn(`⚠️ 组件 ${name} 需要手动注册或在自动加载配置中添加`)
  
  return null
}

export default setupAutoRegister
