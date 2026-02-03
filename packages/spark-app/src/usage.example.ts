/**
 * 示例：如何在消费层使用 SparkApp.start() 
 * 
 * 原来的错误模板已从 start.ts 移除，现在必须：
 * 1. 使用自定义降级组件（推荐）
 * 2. 使用 onStartError 钩子完全接管错误处理
 */

import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'
import ErrorFallback from './ErrorFallback.vue'

// 方式 1：使用自定义降级组件（推荐）
SparkApp.start({
  rootComponent: App,
  fallbackComponent: ErrorFallback,  // 在消费层提供错误模板
  // ... 其他配置
})

// 方式 2：使用 onStartError 钩子完全接管
SparkApp.start({
  rootComponent: App,
  onStartError: async (error) => {
    // 消费层决定如何处理错误
    console.error('启动失败:', error)
    document.body.innerHTML = `
      <div style="padding: 20px;">
        <h1>启动失败</h1>
        <pre>${error.stack}</pre>
      </div>
    `
  },
  // ... 其他配置
})

// ❌ 注意：如果既不提供 fallbackComponent 也不提供 onStartError
// 应用启动失败后不会有任何 UI 提示，只会抛出错误到控制台
// 强烈建议至少提供 fallbackComponent！

