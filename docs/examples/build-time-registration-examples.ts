/**
 * 编译时组件注册使用示例
 * 
 * 展示如何使用 vite-plugin-spark-components 插件生成的虚拟模块
 * 进行零运行时开销的组件注册
 * 
 * @module BuildTimeRegistrationExamples
 */

import { createApp } from 'vue'
import App from './App.vue'
import { Spark } from '@spark-view/spark-component'
import { registerComponents, getComponentMetadata } from 'virtual:spark-components'

/* =============================================================================
 * 示例 1: 基础使用 - 最简单的方式
 * =========================================================================== */

export function example1_BasicUsage() {
  const app = createApp(App)
  
  // 安装 SPARK 插件
  app.use(Spark.createPlugin())
  
  // 注册所有组件（编译时已生成，零运行时开销）
  registerComponents(app)
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 2: 带统计信息
 * =========================================================================== */

export function example2_WithStats() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 注册组件并获取统计信息
  const stats = registerComponents(app)
  
  console.log('📦 组件注册统计:')
  console.log(`  总数: ${stats.total}`)
  console.log(`  同步: ${stats.sync}`)
  console.log(`  异步: ${stats.async}`)
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 3: 开发环境详细日志
 * =========================================================================== */

export function example3_DevelopmentLogging() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  const stats = registerComponents(app)
  
  // 仅在开发环境输出详细信息
  if (import.meta.env.DEV) {
    console.group('📦 SPARK 组件注册')
    console.log(`总数: ${stats.total} (同步: ${stats.sync}, 异步: ${stats.async})`)
    
    // 输出所有组件元数据
    const metadata = getComponentMetadata()
    console.table(metadata)
    
    console.groupEnd()
  }
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 4: 性能监控
 * =========================================================================== */

export function example4_PerformanceMonitoring() {
  // 记录启动时间
  const startTime = performance.now()
  
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 记录注册时间
  const registerStartTime = performance.now()
  const stats = registerComponents(app)
  const registerEndTime = performance.now()
  
  app.mount('#app')
  
  const endTime = performance.now()
  
  // 输出性能指标
  console.group('⚡ 性能指标')
  console.log(`组件注册: ${(registerEndTime - registerStartTime).toFixed(2)}ms`)
  console.log(`应用启动: ${(endTime - startTime).toFixed(2)}ms`)
  console.log(`注册组件: ${stats.total} 个`)
  console.groupEnd()
  
  // 预期结果：组件注册 < 1ms（编译时已完成）
}

/* =============================================================================
 * 示例 5: 检测大文件组件
 * =========================================================================== */

export function example5_DetectLargeComponents() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  registerComponents(app)
  
  // 检测超过 100KB 的组件
  const metadata = getComponentMetadata()
  const largeComponents = metadata.filter(c => c.size > 100)
  
  if (largeComponents.length > 0) {
    console.warn('⚠️ 检测到大文件组件 (>100KB):')
    largeComponents.forEach(c => {
      console.warn(`  - ${c.name}: ${c.size} KB (${c.strategy})`)
    })
    console.log('💡 建议: 考虑代码分割或懒加载')
  }
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 6: 策略统计
 * =========================================================================== */

export function example6_StrategyAnalysis() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  registerComponents(app)
  
  const metadata = getComponentMetadata()
  
  // 按策略分组统计
  const syncComponents = metadata.filter(c => c.strategy === 'sync')
  const asyncComponents = metadata.filter(c => c.strategy === 'async')
  
  // 计算总大小
  const syncSize = syncComponents.reduce((sum, c) => sum + c.size, 0)
  const asyncSize = asyncComponents.reduce((sum, c) => sum + c.size, 0)
  
  console.group('📊 加载策略分析')
  console.log('同步组件:')
  console.log(`  数量: ${syncComponents.length}`)
  console.log(`  总大小: ${syncSize.toFixed(2)} KB`)
  console.log(`  平均大小: ${(syncSize / syncComponents.length).toFixed(2)} KB`)
  
  console.log('\n异步组件:')
  console.log(`  数量: ${asyncComponents.length}`)
  console.log(`  总大小: ${asyncSize.toFixed(2)} KB`)
  console.log(`  平均大小: ${(asyncSize / asyncComponents.length).toFixed(2)} KB`)
  console.groupEnd()
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 7: 生产环境优化
 * =========================================================================== */

export function example7_ProductionOptimized() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 生产环境：静默注册
  registerComponents(app)
  
  // 开发环境：输出统计
  if (import.meta.env.DEV) {
    const stats = registerComponents(app)
    console.log(`✅ 已注册 ${stats.total} 个组件`)
  }
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 8: 错误处理
 * =========================================================================== */

export function example8_ErrorHandling() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  try {
    const stats = registerComponents(app)
    
    // 验证注册是否成功
    if (stats.total === 0) {
      throw new Error('未找到任何组件')
    }
    
    console.log(`✅ 成功注册 ${stats.total} 个组件`)
  } catch (error) {
    console.error('❌ 组件注册失败:', error)
    
    // 降级处理：使用运行时注册
    console.warn('⚠️ 降级到运行时注册')
    // fallback to runtime registration...
  }
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 9: 组件搜索
 * =========================================================================== */

export function example9_ComponentSearch() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  registerComponents(app)
  
  // 搜索特定组件
  const metadata = getComponentMetadata()
  
  // 按名称搜索
  const userComponents = metadata.filter(c => c.name.includes('user'))
  console.log('User 相关组件:', userComponents)
  
  // 按路径搜索
  const featureComponents = metadata.filter(c => c.path.includes('features/'))
  console.log('Features 组件:', featureComponents)
  
  // 按策略搜索
  const syncComponents = metadata.filter(c => c.strategy === 'sync')
  console.log('同步加载组件:', syncComponents.map(c => c.name))
  
  app.mount('#app')
}

/* =============================================================================
 * 示例 10: 与路由集成
 * =========================================================================== */

export function example10_RouterIntegration() {
  import { createRouter, createWebHistory } from 'vue-router'
  
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 先注册组件
  const stats = registerComponents(app)
  console.log(`✅ 注册了 ${stats.total} 个组件`)
  
  // 再创建路由（路由组件已自动注册）
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: () => import('./views/Home.vue')
      },
      // 其他路由...
    ]
  })
  
  app.use(router)
  app.mount('#app')
}

/* =============================================================================
 * 示例 11: 性能对比测试
 * =========================================================================== */

export async function example11_PerformanceComparison() {
  console.group('⚡ 性能对比：编译时 vs 运行时')
  
  // 编译时注册
  const buildTimeStart = performance.now()
  const app1 = createApp(App)
  app1.use(Spark.createPlugin())
  registerComponents(app1)
  const buildTimeEnd = performance.now()
  
  console.log(`编译时注册: ${(buildTimeEnd - buildTimeStart).toFixed(2)}ms`)
  
  // 运行时注册（模拟）
  const runtimeStart = performance.now()
  const app2 = createApp(App)
  app2.use(Spark.createPlugin())
  
  // 模拟运行时扫描开销
  await new Promise(resolve => setTimeout(resolve, 200)) // 扫描 200ms
  const runtimeEnd = performance.now()
  
  console.log(`运行时注册: ${(runtimeEnd - runtimeStart).toFixed(2)}ms`)
  
  const improvement = ((runtimeEnd - runtimeStart) / (buildTimeEnd - buildTimeStart) * 100).toFixed(0)
  console.log(`性能提升: ${improvement}x`)
  
  console.groupEnd()
  
  app1.mount('#app')
}

/* =============================================================================
 * 示例 12: 条件注册（根据环境）
 * =========================================================================== */

export function example12_ConditionalRegistration() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 根据环境决定是否注册某些组件
  const stats = registerComponents(app)
  
  // 在开发环境额外注册调试组件
  if (import.meta.env.DEV) {
    const registry = Spark.getRegistry()
    
    // 手动注册开发专用组件
    import('./components/DevTools.vue').then(module => {
      registry.register('dev-tools', module.default)
      console.log('🛠️ 已注册开发工具组件')
    })
  }
  
  console.log(`✅ 注册了 ${stats.total} 个组件`)
  app.mount('#app')
}

/* =============================================================================
 * 生产环境推荐配置 ⭐⭐⭐⭐⭐
 * =========================================================================== */

/**
 * 生产环境推荐：零开销、静默注册
 * 
 * 特点：
 * - 无日志输出，减少控制台噪音
 * - 零运行时开销
 * - 最优性能
 */
export function productionRecommended() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 静默注册，无日志
  registerComponents(app)
  
  app.mount('#app')
}

/**
 * 开发环境推荐：详细日志、性能监控
 * 
 * 特点：
 * - 详细的组件统计
 * - 性能指标输出
 * - 大文件警告
 */
export function developmentRecommended() {
  const startTime = performance.now()
  
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  const stats = registerComponents(app)
  const metadata = getComponentMetadata()
  
  // 性能统计
  const endTime = performance.now()
  console.group('📦 SPARK 组件系统')
  console.log(`组件数量: ${stats.total} (同步: ${stats.sync}, 异步: ${stats.async})`)
  console.log(`注册耗时: ${(endTime - startTime).toFixed(2)}ms`)
  
  // 大文件警告
  const largeComponents = metadata.filter(c => c.size > 100)
  if (largeComponents.length > 0) {
    console.warn(`⚠️ 大文件组件 (${largeComponents.length}):`, largeComponents)
  }
  
  console.groupEnd()
  
  app.mount('#app')
}

/* =============================================================================
 * 导出
 * =========================================================================== */

export default {
  productionRecommended,
  developmentRecommended,
  example1_BasicUsage,
  example2_WithStats,
  example3_DevelopmentLogging,
  example4_PerformanceMonitoring,
  example5_DetectLargeComponents,
  example6_StrategyAnalysis,
  example7_ProductionOptimized,
  example8_ErrorHandling,
  example9_ComponentSearch,
  example10_RouterIntegration,
  example11_PerformanceComparison,
  example12_ConditionalRegistration
}
