import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// EJ2 样式 - 使用CDN而不是npm包
// import '@syncfusion/ej2-base/styles/material.css'
// import '@syncfusion/ej2-grids/styles/material.css'
// import '@syncfusion/ej2-inputs/styles/material.css'
// import '@syncfusion/ej2-calendars/styles/material.css'

import router from '../src/router'
import App from './App.vue'
import '../src/style.css'

// 初始化SPARK组件系统
import { Spark } from '../features/spark'
import { defaultComponentRegistry } from '@spark-view/spark-core'

// EJ2 注册码
import { registerLicense } from '@syncfusion/ej2-base'
registerLicense(import.meta.env['VITE_EJ2_LICENSE_KEY'])

const app = createApp(App)
// 注册 Element Plus
app.use(ElementPlus)

// 修复 manager 兼容性问题 - 安全获取 manager 实例
let globalManager
try {
  globalManager = Spark.manager()
} catch (e) {
  // 更明确的错误提示，便于调试
   
  console.error('[app] Failed to get Spark manager:', e)
  throw e
}

if (!globalManager) {
  throw new Error('Spark manager is not available after initialization.')
}

// 设置全局 manager（兼容老版测试回退；首选使用依赖注入和 Spark.manager()）
if (typeof globalThis !== 'undefined') {
  globalThis.__sparkComponentManager = globalManager
}

// 初始化SPARK组件系统
await Spark.initialize()
await Spark.initializeApp(globalManager)

// 注入全局 manager（通过 provide 以支持依赖注入，替代对 globalThis 直接依赖）
app.provide('sparkManager', globalManager)
// 注入全局 registry（用于依赖注入的回退实现）
app.provide('sparkRegistry', defaultComponentRegistry)

// EJ2 插件 - 按需使用，不全局注册
// app.use(TextBoxPlugin)
// app.use(NumericTextBoxPlugin)
// app.use(DatePickerPlugin)
// app.use(GridPlugin)

// 注册路由
app.use(router)

app.mount('#app')