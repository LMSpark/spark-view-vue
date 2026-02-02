import type {PageConfig, RouteConfig, ApiResponse} from '../types'
import { logger } from '@/utils/logger'

// SPA模式：使用 fetch 加载静态配置
let routesDataCache: RouteConfig[] | null = null

const loadRoutesData = async (): Promise<RouteConfig[]> => {
    if (routesDataCache !== null) {
        return routesDataCache
    }
    const response = await fetch('/pages-config/routes.json')
    const data: RouteConfig[] = await response.json()
    routesDataCache = data
    return data
}

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
        logger.info('SPA模式：直接加载页面配置', { pageId });
        
        try {
            // 使用 fetch 加载 public 目录下的 JSON 文件
            const [ruleResponse, dataResponse] = await Promise.all([
                fetch(`/pages-config/${pageId}/rule.json`),
                fetch(`/pages-config/${pageId}/pagedata.json`)
            ])
            
            const rule = await ruleResponse.json()
            const data = await dataResponse.json()
            
            return { rule, data }
        } catch (importError) {
            logger.error('无法加载页面配置', { pageId, error: importError });
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
        logger.info('SPA模式：直接加载路由配置');
        return await loadRoutesData()
    }
}
