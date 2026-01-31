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
import { registerCustomComponents } from './components'

// 创建并提供显式 manager 与 registry（强制 DI）
const globalRegistry = Spark.createRegistry()
const globalManager = Spark.createManager(undefined, globalRegistry)

// EJ2 注册码
import { registerLicense } from '@syncfusion/ej2-base'
registerLicense(import.meta.env['VITE_EJ2_LICENSE_KEY'])

const app = createApp(App)
// 注册 Element Plus
app.use(ElementPlus)

// 初始化SPARK组件系统
await Spark.initialize()
await Spark.initializeApp(globalManager)

// 注册自定义组件 - 传入已创建的管理器
registerCustomComponents(globalManager)

// 使用 Spark 的严格 Vue 插件安装（需显式传入 manager 与 registry）
Spark.install(app, { manager: globalManager, registry: globalRegistry })

// EJ2 插件 - 按需使用，不全局注册
// app.use(TextBoxPlugin)
// app.use(NumericTextBoxPlugin)
// app.use(DatePickerPlugin)
// app.use(GridPlugin)

// 注册路由
app.use(router)

app.mount('#app')