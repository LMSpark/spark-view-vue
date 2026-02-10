/**
 * 智能组件自动加载示例
 * 
 * @description
 * 展示如何使用 AutoLoader 自动扫描和注册组件
 * 无需手动 import 和 register
 */

import { createApp } from 'vue'
import { Spark, AutoLoader } from '@spark-view/spark-component'
import type { AutoLoaderConfig } from '@spark-view/spark-component'

// 示例 1: 使用 setupAutoRegister（推荐）
export async function example1_simpleSetup() {
  const app = createApp({})
  
  // 安装 SPARK 插件
  app.use(Spark.createPlugin())
  
  // 🎯 自动注册所有组件（一行代码）
  const { setupAutoRegister } = await import('../../src/bootstrap/auto-register')
  await setupAutoRegister(app, {
    mode: 'demand',      // 按需加载模式
    showProgress: true   // 显示加载进度
  })
  
  app.mount('#app')
}

// 示例 2: 手动配置 AutoLoader
export async function example2_manualSetup() {
  const app = createApp({})
  app.use(Spark.createPlugin())
  
  const registry = Spark.getRegistry()
  
  // 创建自动加载器
  const loader = AutoLoader.create({
    // 使用 Vite glob 扫描组件
    patterns: {
      // packages 目录的组件
      ...import.meta.glob('../packages/*/src/components/**/*.vue'),
      // features 目录的组件
      ...import.meta.glob('../features/**/components/**/*.vue'),
      // src 目录的组件
      ...import.meta.glob('./components/**/*.vue'),
      ...import.meta.glob('./views/**/*.vue')
    },
    
    // 同步加载的核心组件
    syncComponents: [
      'PageRenderer',
      'SparkComponentRenderer',
      'ErrorFallback'
    ],
    
    // 异步加载的组件
    asyncComponents: [
      '*EJ2*',      // Syncfusion 组件
      '*Demo',      // Demo 组件
      'Dashboard',  // 仪表板
      'Settings'    // 设置页面
    ],
    
    // 自动分析阈值
    sizeThreshold: 50,
    autoAnalyze: true,
    
    // 使用全局注册表
    registry
  })
  
  // 按需加载模式
  await loader.loadOnDemand()
  
  // 查看统计
  console.log('📊 加载统计:', loader.getStats())
  
  app.mount('#app')
}

// 示例 3: 开发/生产环境区分
export async function example3_envBasedSetup() {
  const app = createApp({})
  app.use(Spark.createPlugin())
  
  const { setupAutoRegister } = await import('../../src/bootstrap/auto-register')
  
  // 根据环境选择加载模式
  if (import.meta.env.DEV) {
    // 开发环境：全部加载，方便调试
    await setupAutoRegister(app, { mode: 'all' })
  } else {
    // 生产环境：按需加载，优化性能
    await setupAutoRegister(app, { mode: 'demand' })
  }
  
  app.mount('#app')
}

// 示例 4: 自定义加载策略
export async function example4_customStrategy() {
  const registry = Spark.getRegistry()
  
  const loader = AutoLoader.create({
    patterns: import.meta.glob('./components/**/*.vue'),
    
    // 自定义同步组件列表
    syncComponents: [
      // 核心渲染器
      'PageRenderer',
      'SparkComponentRenderer',
      
      // 布局组件
      'Layout*',
      'Header',
      'Footer',
      
      // 首屏组件
      'Home*',
      'Navigation'
    ],
    
    // 自定义异步组件列表
    asyncComponents: [
      // 重型组件
      '*Chart*',
      '*Heavy*',
      
      // 第三方库
      '*EJ2*',
      '*Editor*',
      
      // 非首屏页面
      'Dashboard',
      'Profile',
      'Settings',
      
      // 开发组件
      '*Demo',
      '*Test',
      '*Dev'
    ],
    
    // 50KB 以上的组件自动异步加载
    sizeThreshold: 50,
    
    registry
  })
  
  await loader.loadOnDemand()
  
  return loader
}

// 示例 5: 监听加载进度
export async function example5_withProgress() {
  const registry = Spark.getRegistry()
  
  const loader = AutoLoader.create({
    patterns: import.meta.glob('./components/**/*.vue'),
    registry
  })
  
  // 扫描组件
  console.log('🔍 开始扫描组件...')
  const components = await loader.scan()
  console.log(`✅ 发现 ${components.length} 个组件`)
  
  // 加载同步组件
  console.log('⚡ 加载同步组件...')
  await loader.loadSyncComponents()
  
  // 后台预加载异步组件
  console.log('🔄 后台预加载异步组件...')
  // loadAll 会自动在后台加载异步组件
  
  // 查看加载统计
  const stats = loader.getStats()
  console.log('📊 加载完成:')
  console.log(`   • 总组件: ${stats.total}`)
  console.log(`   • 已加载: ${stats.loaded}`)
  console.log(`   • 待加载: ${stats.pending}`)
  console.log(`   • 同步: ${stats.sync}`)
  console.log(`   • 异步: ${stats.async}`)
  
  return loader
}

// 示例 6: 按需手动加载
export async function example6_manualLoad() {
  const registry = Spark.getRegistry()
  
  const loader = AutoLoader.create({
    patterns: import.meta.glob('./components/**/*.vue'),
    registry
  })
  
  // 只加载同步组件
  await loader.loadOnDemand()
  
  // 后续按需手动加载特定组件
  console.log('📦 按需加载 Dashboard...')
  await loader.loadComponent('dashboard')
  
  console.log('📦 按需加载 Settings...')
  await loader.loadComponent('settings')
  
  return loader
}

// 示例 7: 与路由集成
export async function example7_withRouter() {
  const app = createApp({})
  const router = createRouter({ ... })
  
  app.use(Spark.createPlugin())
  
  const { setupAutoRegister } = await import('../../src/bootstrap/auto-register')
  const loader = await setupAutoRegister(app, { mode: 'demand' })
  
  // 路由守卫中预加载组件
  router.beforeEach(async (to) => {
    // 根据路由预加载对应组件
    if (to.name === 'dashboard') {
      await loader.loadComponent('dashboard')
    } else if (to.name === 'settings') {
      await loader.loadComponent('settings')
    }
    
    return true
  })
  
  app.use(router)
  app.mount('#app')
}

// 示例 8: 完整的配置示例
export const fullConfig: AutoLoaderConfig = {
  patterns: {
    // 扫描所有组件目录
    ...import.meta.glob('../packages/*/src/components/**/*.vue'),
    ...import.meta.glob('../features/**/components/**/*.vue'),
    ...import.meta.glob('./components/**/*.vue'),
    ...import.meta.glob('./views/**/*.vue')
  },
  
  // 同步加载：核心组件（立即使用）
  syncComponents: [
    // 渲染引擎
    'PageRenderer',
    'SparkComponentRenderer',
    
    // 错误处理
    'ErrorFallback',
    
    // 布局组件
    'Layout',
    'Header',
    'Footer',
    'Navigation',
    
    // 首屏组件
    'Home',
    'Login',
    
    // 轻量级 Demo 组件
    'UserGrid',
    'UserRow',
    'UserField'
  ],
  
  // 异步加载：大型组件和非首屏组件
  asyncComponents: [
    // 第三方大型库
    '*EJ2*',           // Syncfusion 组件
    '*Editor*',        // 富文本编辑器
    '*Chart*',         // 图表组件
    
    // 非首屏页面
    'Dashboard',
    'About',
    'Settings',
    'Profile',
    
    // Demo 和测试组件
    '*Demo',
    '*Test',
    'JsonRenderer*',
    'Capability*',
    'ComponentRenderer*',
    'TenantConfig*',
    
    // 重型组件
    'Heavy*',
    '*Heavy'
  ],
  
  // 50KB 以上自动异步
  sizeThreshold: 50,
  
  // 启用智能分析
  autoAnalyze: true
}

// 示例 9: 迁移指南
export async function example9_migration() {
  // ❌ 旧方式：手动注册
  /*
  import UserGrid from './components/UserGrid.vue'
  import UserRow from './components/UserRow.vue'
  
  const registry = Spark.getRegistry()
  registry.register('user-grid', UserGrid)
  registry.register('user-row', UserRow)
  */
  
  // ✅ 新方式：自动加载
  const app = createApp({})
  app.use(Spark.createPlugin())
  
  const { setupAutoRegister } = await import('../../src/bootstrap/auto-register')
  await setupAutoRegister(app)
  
  // 完成！所有组件自动注册
  app.mount('#app')
}

// 示例 10: 性能对比
export async function example10_performance() {
  console.time('⏱️ 启动时间')
  
  const app = createApp({})
  app.use(Spark.createPlugin())
  
  const { setupAutoRegister } = await import('../../src/bootstrap/auto-register')
  
  console.time('  📦 组件加载')
  await setupAutoRegister(app, { mode: 'demand' })
  console.timeEnd('  📦 组件加载')
  
  console.time('  🎨 DOM 挂载')
  app.mount('#app')
  console.timeEnd('  🎨 DOM 挂载')
  
  console.timeEnd('⏱️ 启动时间')
  
  // 预期输出（按需加载）：
  // ⏱️ 启动时间: 800ms
  //   📦 组件加载: 200ms (只加载 5 个核心组件)
  //   🎨 DOM 挂载: 600ms
  
  // 对比（全部加载）：
  // ⏱️ 启动时间: 3000ms
  //   📦 组件加载: 2000ms (加载全部 15 个组件)
  //   🎨 DOM 挂载: 1000ms
}

export default {
  example1_simpleSetup,
  example2_manualSetup,
  example3_envBasedSetup,
  example4_customStrategy,
  example5_withProgress,
  example6_manualLoad,
  example7_withRouter,
  fullConfig,
  example9_migration,
  example10_performance
}
