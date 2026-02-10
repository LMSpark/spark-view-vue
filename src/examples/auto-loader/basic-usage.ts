/**
 * AutoLoader 基础使用示例
 * 
 * @description 展示最简单的 AutoLoader 使用方式
 */

import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { setupAutoRegister } from '@/bootstrap/auto-register'

/**
 * 示例：最简单的使用方式
 */
export async function basicUsage() {
  const app = createApp({})
  
  // 1. 安装 SPARK 插件
  app.use(Spark.createPlugin())
  
  // 2. 自动注册所有组件（一行代码）
  await setupAutoRegister(app, {
    mode: 'demand',      // 按需加载模式
    showProgress: true   // 显示加载进度
  })
  
  // 3. 挂载应用
  app.mount('#app')
}

/**
 * 示例：开发/生产环境区分
 */
export async function envBasedSetup() {
  const app = createApp({})
  app.use(Spark.createPlugin())
  
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

export default {
  basicUsage,
  envBasedSetup
}
