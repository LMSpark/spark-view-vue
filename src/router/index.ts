import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import DynamicPage from '../views/DynamicPage.vue'
import { getRoutes } from '../services/page-config'
import { logger } from '@/utils/logger'

// 动态路由配置（从 pages-config/routes.json 加载）
let dynamicRoutes: RouteRecordRaw[] = []
let routesLoaded = false
let routesLoadingPromise: Promise<void> | null = null

// 创建路由器
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home'
    }
  ]
})

// 异步加载路由配置
const loadDynamicRoutes = async () => {
  if (routesLoadingPromise) {
    return routesLoadingPromise
  }
  
  routesLoadingPromise = (async () => {
    try {
      const routeConfigs = await getRoutes()
      
      dynamicRoutes = routeConfigs.map(config => ({
        path: config.path,
        name: config.name,
        component: DynamicPage,
        meta: config.meta
      }))
      
      // 动态添加路由
      dynamicRoutes.forEach(route => {
        router.addRoute(route)
      })
      
      routesLoaded = true
      logger.success('动态路由加载成功', { routeCount: dynamicRoutes.length })
    } catch (error) {
      logger.error('加载路由失败', error)
      throw error
    }
  })()
  
  return routesLoadingPromise
}

// 路由守卫：确保路由已加载
router.beforeEach(async (_to, _from, next) => {
  if (!routesLoaded) {
    await loadDynamicRoutes()
  }
  next()
})

// 初始化路由
void loadDynamicRoutes()

export default router