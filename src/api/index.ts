import type {PageConfig, RouteConfig, ApiResponse} from '../types'

// SPA模式：直接导入静态配置，避免API请求问题
import routesData from '../pages-config/routes.json'

export const getPageConfig = async (pageId: string): Promise<PageConfig> => {
    try {
        // 尝试API请求（开发环境有mock）
        const response = await fetch(`/api/getPageConfig?pageId=${pageId}`)
        const result: ApiResponse<PageConfig> = await response.json()
        
        if (result.code === 200) {
            return result.data
        }
        throw new Error(result.message)
    } catch {
        // API失败时使用静态导入（SPA模式）
        console.info(`📦 SPA模式：直接加载页面配置 ${pageId}`)
        
        try {
            // 动态导入页面配置文件
            const ruleModule = await import(`../pages-config/${pageId}/rule.json`)
            const dataModule = await import(`../pages-config/${pageId}/pagedata.json`)
            
            return {
                rule: ruleModule.default ?? ruleModule,
                data: dataModule.default ?? dataModule
            }
        } catch (importError) {
            console.error(`❌ 无法加载页面配置: ${pageId}`, importError)
            throw new Error(`页面配置不存在: ${pageId}`)
        }
    }
}

export const getRoutes = async (): Promise<RouteConfig[]> => {
    try {
        // 尝试API请求（开发环境有mock）
        const response = await fetch('/api/getRoutes')
        const result: ApiResponse<RouteConfig[]> = await response.json()
        
        if (result.code === 200) {
            return result.data
        }
        throw new Error(result.message)
    } catch {
        // API失败时使用静态导入（SPA模式）
        console.info('📦 SPA模式：直接加载路由配置')
        return routesData
    }
}
