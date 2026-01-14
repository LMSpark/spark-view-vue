import {renderToString} from 'vue/server-renderer'
import {createApp, installRouter} from './app'
import {createMemoryHistory, createRouter, type Router} from 'vue-router'
import DynamicPage from './views/DynamicPage.vue'
import type {RouteConfig} from './types'
// 在 SSR 模式下直接导入 Mock 数据
import mockRoutes from './pages-config/routes.json'

/**
 * 创建服务端路由实例
 */
async function createSSRRouter(): Promise<Router> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: []
    })
    
    try {
        // 服务端直接使用 Mock 数据
        const routeConfigs = mockRoutes as RouteConfig[]
        
        routeConfigs.forEach((config: RouteConfig) => {
            router.addRoute({
                path: config.path,
                name: config.name,
                component: DynamicPage,
                meta: {
                    ...config.meta,
                    pageId: config.pageId || config.name
                }
            })
        })
    } catch (error) {
        console.error('❌ 加载路由配置失败:', error)
        // 添加默认路由
        router.addRoute({
            path: '/',
            name: 'home',
            component: DynamicPage,
            meta: {title: '工作台', pageId: 'home'}
        })
    }
    
    return router
}

/**
 * 服务端渲染入口
 */
export async function render(url: string) {
    const {app} = createApp()
    
    // 创建服务端路由
    const router = await createSSRRouter()
    
    // 安装路由
    installRouter(app, router)
    
    // 导航到请求的 URL
    await router.push(url)
    await router.isReady()
    
    // 渲染应用为 HTML 字符串
    const html = await renderToString(app)
    
    // 获取当前路由的 meta 信息
    const currentRoute = router.currentRoute.value
    const title = currentRoute.meta?.title || 'FormCreate Demo'
    
    return {
        html,
        title,
        meta: currentRoute.meta || {}
    }
}
