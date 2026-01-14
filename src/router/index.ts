import {createRouter, createWebHistory, RouteRecordRaw} from 'vue-router'
import {getRoutes} from '../api'
import type {RouteConfig} from '../types'
import DynamicPage from '../views/DynamicPage.vue'
import RendererDemoPage from '../views/RendererDemoPage.vue'

// 创建路由实例
const router = createRouter({
    history: createWebHistory(),
    routes: [] // 初始为空，动态添加
})

// 动态加载路由配置
export const setupRouter = async () => {
    try {
        const routeConfigs = await getRoutes()
        
        // 将配置转换为路由记录 - 所有路由都使用 DynamicPage 组件
        const routes: RouteRecordRaw[] = routeConfigs.map((config: RouteConfig) => {
            // renderer-demo 使用独立组件
            if (config.pageId === 'renderer-demo') {
                return {
                    path: config.path,
                    name: config.name,
                    component: RendererDemoPage,
                    meta: config.meta
                }
            }
            
            // 其他页面使用 DynamicPage
            return {
                path: config.path,
                name: config.name,
                component: DynamicPage,
                meta: {
                    ...config.meta,
                    pageId: config.pageId || config.name // 通过 meta 传递页面ID
                }
            }
        })
        
        // 动态添加路由
        routes.forEach(route => {
            router.addRoute(route)
            console.log('➕ 注册路由:', route.path, '→', route.name)
        })
        
        console.log('✅ 动态路由加载成功:', routes.length, '个路由')
        console.log('📋 所有路由:', router.getRoutes().map(r => r.path))
    } catch (error) {
        console.error('❌ 加载路由配置失败:', error)
        // 添加默认路由作为降级方案
        router.addRoute({
            path: '/',
            name: 'home',
            component: DynamicPage,
            meta: {title: '工作台', pageId: 'home'}
        })
    }
}

export default router
