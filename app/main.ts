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

// EJ2 注册码
import { registerLicense } from '@syncfusion/ej2-base'
registerLicense(import.meta.env['VITE_EJ2_LICENSE_KEY'])

// EJ2 插件 - 只导入需要的组件，不全局注册
// import { TextBoxPlugin, NumericTextBoxPlugin } from '@syncfusion/ej2-vue-inputs'
// import { DatePickerPlugin } from '@syncfusion/ej2-vue-calendars'
// import { GridPlugin } from '@syncfusion/ej2-vue-grids'
const app = createApp(App)

// 注册 Element Plus
app.use(ElementPlus)

// 修复 manager 兼容性问题 - 安全获取 manager 实例
let globalManager
try {
  globalManager = Spark.manager()
} catch (e) {
  // 更明确的错误提示，便于调试
  // eslint-disable-next-line no-console
  console.error('[app] Failed to get Spark manager:', e)
  throw e
}

if (!globalManager) {
  throw new Error('Spark manager is not available after initialization.')
}

// 设置全局 manager（用于 useSparkComponent 的 globalThis 回退）
if (typeof globalThis !== 'undefined') {
  globalThis.__globalSparkComponentManager = globalManager
}

// 初始化SPARK组件系统
await Spark.initialize()
await Spark.initializeApp()

// 注入全局 manager（通过 provide 以支持依赖注入，替代对 globalThis 直接依赖）
app.provide('sparkManager', globalManager)

// EJ2 插件 - 按需使用，不全局注册
// app.use(TextBoxPlugin)
// app.use(NumericTextBoxPlugin)
// app.use(DatePickerPlugin)
// app.use(GridPlugin)

// 注册路由
app.use(router)

app.mount('#app')