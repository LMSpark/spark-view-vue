import { createApp, installRouter } from './app'
import router, { setupRouter } from './router'

// 客户端入口：用于激活服务端渲染的 HTML
;(async () => {
    const { app } = createApp()
    
    // 动态加载路由配置
    await setupRouter()
    
    // 安装路由
    installRouter(app, router)
    
    // 等待路由准备就绪
    await router.isReady()
    
    // 挂载应用，激活服务端渲染的 HTML
    app.mount('#app')
    
    console.log('✅ 客户端应用已激活（hydrated）')
})()
