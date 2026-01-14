import { createSSRApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import App from './App.vue'
import './style.css'
import type { Router } from 'vue-router'

// ✅ EJ2 注册码
import { registerLicense } from '@syncfusion/ej2-base'
registerLicense('Ngo9BigBOggjHTQxAR8/V1JGaF5cXGpCf1FpRmJGdld5fUVHYVZUTXxaS00DNHVRdkdlWX5eeXRRQ2hdVUZzWURWYEs=')

// ✅ EJ2 插件（SSR 支持，Grid 使用递归渲染）
import { TextBoxPlugin, NumericTextBoxPlugin } from '@syncfusion/ej2-vue-inputs'
import { DatePickerPlugin } from '@syncfusion/ej2-vue-calendars'
import { GridPlugin } from '@syncfusion/ej2-vue-grids'

/**
 * 创建 Vue 应用实例（客户端和服务端共用）
 */
export function createApp() {
    const app = createSSRApp(App)
    
    // 必须先注册 Element Plus，form-create 才能使用这些组件
    app.use(ElementPlus)
    
    // ✅ 使用 EJ2 GridPlugin（递归渲染方式）
    app.use(GridPlugin)
    
    app.use(formCreate)
    
    // ✅ 注册其他 EJ2 插件
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
