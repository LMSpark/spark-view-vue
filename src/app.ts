import { createSSRApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'
import App from './App.vue'
import './style.css'
import type { Router } from 'vue-router'

/**
 * 创建 Vue 应用实例（客户端和服务端共用）
 */
export function createApp() {
    const app = createSSRApp(App)
    
    app.use(ElementPlus)
    app.use(formCreate)
    
    return { app }
}

/**
 * 为应用安装路由（在路由配置加载后调用）
 */
export function installRouter(app: any, router: Router) {
    app.use(router)
    return app
}
