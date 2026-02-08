// packages/spark-utils/src/tools/componentLibraryTool.ts
/**
 * 组件库查询工具 - MCP 工具模拟实现
 *
 * 提供组件元数据的查询功能，供AI在生成配置时使用
 */

import fs from 'fs'
import path from 'path'
import axios from 'axios'

export interface ComponentMetadata {
  props: Array<{
    name: string
    type?: string
    description?: string
    required?: boolean
    defaultValue?: unknown
  }>
  events: Array<{
    name: string
    description?: string
  }>
  slots: Array<{
    name: string
    description?: string
  }>
  description?: string
  sourcePath?: string
  isMock?: boolean
}

export interface ComponentLibrary {
  [componentName: string]: ComponentMetadata
}

// 配置选项
export interface ComponentLibraryConfig {
  useServer?: boolean
  serverUrl?: string
  localFilePath?: string
}

let config: ComponentLibraryConfig = {
  useServer: false,
  serverUrl: 'http://localhost:3001',
  localFilePath: path.resolve(process.cwd(), 'component-library.json')
}

/**
 * 配置组件库工具
 */
export function configureComponentLibrary(newConfig: Partial<ComponentLibraryConfig>) {
  config = { ...config, ...newConfig }
}

/**
 * 加载组件库元数据
 */
export async function loadComponentLibrary(): Promise<ComponentLibrary> {
  if (config.useServer) {
    try {
      const response = await axios.get(`${config.serverUrl}/api/component-library`, {
        timeout: 3000
      })

      if (response.data.success) {
        return response.data.data
      }
    } catch (error) {
      console.warn('无法从服务端加载组件库，回退到本地文件:', error.message)
    }
  }

  // 从本地文件加载
  try {
    const filePath = config.localFilePath!
    if (!fs.existsSync(filePath)) {
      console.warn('组件库文件不存在:', filePath)
      return {}
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('加载组件库失败:', error)
    return {}
  }
}

/**
 * 查询组件信息 - MCP 工具实现
 */
export async function getComponentInfo(componentName: string): Promise<ComponentMetadata | null> {
  const library = await loadComponentLibrary()
  return library[componentName] ?? null
}

/**
 * 搜索组件 - 根据关键词搜索
 */
export async function searchComponents(keyword: string): Promise<Array<{ name: string; metadata: ComponentMetadata }>> {
  const library = await loadComponentLibrary()
  const results: Array<{ name: string; metadata: ComponentMetadata }> = []

  for (const [name, metadata] of Object.entries(library)) {
    if (name.toLowerCase().includes(keyword.toLowerCase()) ||
        metadata.description?.toLowerCase().includes(keyword.toLowerCase())) {
      results.push({ name, metadata })
    }
  }

  return results
}

/**
 * 获取所有组件名称
 */
export async function getAllComponentNames(): Promise<string[]> {
  const library = await loadComponentLibrary()
  return Object.keys(library)
}

/**
 * 获取组件推荐 - 基于使用场景
 */
export async function getComponentRecommendations(scenario: string): Promise<Array<{ name: string; metadata: ComponentMetadata; score: number }>> {
  const library = await loadComponentLibrary()
  const recommendations: Array<{ name: string; metadata: ComponentMetadata; score: number }> = []

  for (const [name, metadata] of Object.entries(library)) {
    let score = 0

    // 简单的推荐逻辑 - 可以根据实际需求扩展
    if (scenario.includes('grid') && name.toLowerCase().includes('grid')) score += 10
    if (scenario.includes('table') && name.toLowerCase().includes('table')) score += 10
    if (scenario.includes('form') && name.toLowerCase().includes('form')) score += 10
    if (scenario.includes('chart') && name.toLowerCase().includes('chart')) score += 10

    if (score > 0) {
      recommendations.push({ name, metadata, score })
    }
  }

  return recommendations.sort((a, b) => b.score - a.score)
}

/**
 * MCP 工具定义 - 组件信息查询
 */
export const componentInfoTool = {
  name: 'get-component-info',
  description: '查询特定组件的元数据信息，包括props、events、slots等',
  inputSchema: {
    type: 'object',
    properties: {
      componentName: {
        type: 'string',
        description: '组件名称，如 "spark-ej2-grid"'
      }
    },
    required: ['componentName']
  },
  handler: async (args: { componentName: string }) => {
    const result = await getComponentInfo(args.componentName)
    return result ? {
      success: true,
      data: result
    } : {
      success: false,
      error: `组件 "${args.componentName}" 未找到`
    }
  }
}

/**
 * MCP 工具定义 - 组件搜索
 */
export const componentSearchTool = {
  name: 'search-components',
  description: '根据关键词搜索相关组件',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '搜索关键词'
      }
    },
    required: ['keyword']
  },
  handler: async (args: { keyword: string }) => {
    const results = await searchComponents(args.keyword)
    return {
      success: true,
      data: results
    }
  }
}

/**
 * MCP 工具定义 - 组件推荐
 */
export const componentRecommendationTool = {
  name: 'recommend-components',
  description: '根据使用场景推荐合适的组件',
  inputSchema: {
    type: 'object',
    properties: {
      scenario: {
        type: 'string',
        description: '使用场景描述，如 "显示用户列表数据"'
      }
    },
    required: ['scenario']
  },
  handler: async (args: { scenario: string }) => {
    const recommendations = await getComponentRecommendations(args.scenario)
    return {
      success: true,
      data: recommendations
    }
  }
}

// 导出所有工具
export const componentLibraryTools = [
  componentInfoTool,
  componentSearchTool,
  componentRecommendationTool
] as const