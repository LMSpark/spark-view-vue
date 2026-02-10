/* eslint-disable no-console */
/**
 * AutoLoader 性能监控示例
 */

import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { setupAutoRegister } from '@/bootstrap/auto-register'

/**
 * 示例：性能对比测试
 */
export async function performanceComparison() {
  console.time('⏱️ 启动时间')
  
  const app = createApp({})
  app.use(Spark.createPlugin())
  
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
}

/**
 * 示例：带统计信息的加载
 */
export async function withStats() {
  const app = createApp({})
  app.use(Spark.createPlugin())
  
  const loader = await setupAutoRegister(app, { 
    mode: 'demand',
    showProgress: true 
  })
  
  // 输出加载统计
  if (import.meta.env.DEV) {
    const stats = loader.getStats()
    console.group('📦 组件加载统计')
    console.log(`总数: ${stats.total}`)
    console.log(`已加载: ${stats.loaded}`)
    console.log(`同步: ${stats.sync}`)
    console.log(`异步: ${stats.async}`)
    console.groupEnd()
  }
  
  app.mount('#app')
}

export default {
  performanceComparison,
  withStats
}
