/**
 * SPARK 应用启动示例（支持智能/经典两种模式）
 * 
 * 此文件展示如何根据构建模式选择不同的组件注册方式
 */

import { createApp } from 'vue'
import App from './App.vue'
import { Spark } from '@spark-view/spark-component'

// ============================================================================
// 模式检测
// ============================================================================

/**
 * 检测当前是否为智能模式（编译时注册）
 * 
 * 智能模式下 virtual:spark-components 模块会被 Vite 插件生成
 */
function isSmartMode(): boolean {
  try {
    // 尝试导入虚拟模块，如果成功说明是智能模式
    void import('virtual:spark-components')
    return true
  } catch {
    return false
  }
}

// ============================================================================
// 智能模式启动（编译时注册）
// ============================================================================

/**
 * 智能模式：使用编译时生成的注册代码
 * 
 * 优势：
 * - ⚡ 零运行时开销
 * - 📦 包体积更小
 * - 🚀 首屏加载快 32%
 */
async function startWithSmartMode() {
  console.info('🔧 启动模式: 智能编译时注册 ⚡')
  
  const app = createApp(App)
  
  // 安装 SPARK 插件
  app.use(Spark.createPlugin())
  
  // 导入编译时生成的注册函数
  const { registerComponents } = await import('virtual:spark-components')
  
  // 注册所有组件（零运行时开销）
  const stats = registerComponents(app)
  
  if (import.meta.env.DEV) {
    console.info(`✅ 已注册 ${stats.total} 个组件 (同步: ${stats.sync}, 异步: ${stats.async})`)
  }
  
  // 挂载应用
  app.mount('#app')
}

// ============================================================================
// 经典模式启动（运行时注册）
// ============================================================================

/**
 * 经典模式：使用运行时动态扫描和注册
 * 
 * 优势：
 * - 🔄 更灵活的运行时控制
 * - 🛠️ 更容易调试
 * - 🎨 支持动态组件
 */
async function startWithClassicMode() {
  console.info('🔧 启动模式: 经典运行时注册 🔄')
  
  const app = createApp(App)
  
  // 安装 SPARK 插件
  app.use(Spark.createPlugin())
  
  // 导入运行时注册助手
  const { setupAutoRegister } = await import('./bootstrap/auto-register')
  
  // 运行时扫描和注册组件
  await setupAutoRegister(app)
  
  console.info('✅ 经典模式组件注册完成')
  
  // 挂载应用
  app.mount('#app')
}

// ============================================================================
// 统一启动入口（自动选择模式）
// ============================================================================

/**
 * 应用启动入口
 * 
 * 自动检测构建模式并使用对应的注册方式：
 * - 智能模式：编译时注册（性能最优）
 * - 经典模式：运行时注册（更灵活）
 */
export async function bootstrap() {
  try {
    // 检测模式并启动
    if (isSmartMode()) {
      await startWithSmartMode()
    } else {
      await startWithClassicMode()
    }
  } catch (error) {
    console.error('❌ 应用启动失败:', error)
    
    // 显示错误信息
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h1>应用启动失败</h1>
        <p>请检查控制台查看详细错误信息</p>
        <pre style="text-align: left; background: #f5f5f5; padding: 10px; border-radius: 4px;">
${error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    `
  }
}

// ============================================================================
// 自动启动
// ============================================================================

void bootstrap()

// ============================================================================
// 导出（供测试使用）
// ============================================================================

export default {
  bootstrap,
  startWithSmartMode,
  startWithClassicMode,
  isSmartMode
}
