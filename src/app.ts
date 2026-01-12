import { createSSRApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import App from './App.vue'
import './style.css'
import type { Router } from 'vue-router'

// ✅ EJ2 插件（SSR 支持，Grid 通过 DynamicPage 注册）
import { TextBoxPlugin, NumericTextBoxPlugin } from '@syncfusion/ej2-vue-inputs'
import { DatePickerPlugin } from '@syncfusion/ej2-vue-calendars'
import EJ2TableRenderer from './components/renderers/ej2/TableRenderer.vue'

/**
 * 创建 Vue 应用实例（客户端和服务端共用）
 */
export function createApp() {
    const app = createSSRApp(App)
    
    // 必须先注册 Element Plus，form-create 才能使用这些组件
    app.use(ElementPlus)
    
    // ✅ 在 formCreate 之前全局注册 EJ2 组件到 Vue
    app.component('ejs-grid', EJ2TableRenderer)
    app.component('ej2-grid', EJ2TableRenderer)
    app.component('ej2-table', EJ2TableRenderer)
    app.component('e-columns', { render: () => null })
    app.component('e-column', { render: () => null })
    
    app.use(formCreate)
    
    // ✅ 注册 EJ2 插件（不注册 GridPlugin，避免冲突）
    app.use(TextBoxPlugin)
    app.use(NumericTextBoxPlugin)
    app.use(DatePickerPlugin)
    
    return { app }
}

/**
 * 为应用安装路由（在路由配置加载后调用）
 */
export function installRouter(app: any, router: Router) {
    app.use(router)
    return app
}
