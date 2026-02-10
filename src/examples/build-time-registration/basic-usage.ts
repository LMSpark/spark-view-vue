/* eslint-disable no-console */
/**
 * 编译时组件注册基础示例
 */

import { createApp } from 'vue'
import App from '@/App.vue'
import { Spark } from '@spark-view/spark-component'
import { registerComponents, getComponentMetadata } from 'virtual:spark-components'

/**
 * 示例：最简单的使用方式（推荐生产环境）
 */
export function buildTimeBasicUsage() {
  const app = createApp({})
  
  // 1. 安装 SPARK 插件
  app.use(Spark.createPlugin())
  
  // 2. 注册所有组件（编译时已生成，零开销）
  registerComponents(app)
  
  // 3. 挂载应用
  app.mount('#app')
}

/**
 * 示例：带统计信息
 */
export function buildTimeWithStats() {
  const app = createApp(App)
  app.use(Spark.createPlugin())
  
  // 注册并获取统计信息
  const stats = registerComponents(app)
  
  console.log('📦 组件注册统计:')
  console.log(`  总数: ${stats.total}`)
  console.log(`  同步: ${stats.sync}`)
  console.log(`  异步: ${stats.async}`)
  
  app.mount('#app')
}

/**
 * 示例：开发环境详细日志
 */
export function developmentLogging() {
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

export default {
  buildTimeBasicUsage,
  buildTimeWithStats,
  developmentLogging
}
