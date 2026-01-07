import type {PageConfig, RouteConfig, ApiResponse} from '../types'

export const getPageConfig = async (pageId: string): Promise<PageConfig> => {
    const response = await fetch(`/api/getPageConfig?pageId=${pageId}`)
    const result: ApiResponse<PageConfig> = await response.json()
  
    if (result.code === 200) {
        return result.data
    }
  
    throw new Error(result.message)
}

export const getRoutes = async (): Promise<RouteConfig[]> => {
    const response = await fetch('/api/getRoutes')
    const result: ApiResponse<RouteConfig[]> = await response.json()
  
    if (result.code === 200) {
        return result.data
    }
  
    throw new Error(result.message)
}
