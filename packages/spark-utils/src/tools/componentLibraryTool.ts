// packages/spark-utils/src/tools/componentLibraryTool.ts
/**
 * 组件库查询工具 - MCP 工具模拟实现
 *
 * 提供组件元数据的查询功能，供AI在生成配置时使用
 */

import fs from 'fs'
import path from 'path'

export interface ComponentMetadata {
  props: Array<{
    name: string
    type?: string
    description?: string
    required?: boolean
    defaultValue?: any
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

/**
 * 加载组件库元数据
 */
export function loadComponentLibrary(): ComponentLibrary {
  try {
    const libraryPath = path.resolve(process.cwd(), 'component-library.json')
    if (!fs.existsSync(libraryPath)) {
      console.warn('组件库文件不存在，请先运行构建命令生成')
      return {}
    }

    const content = fs.readFileSync(libraryPath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error('加载组件库失败:', error)
    return {}
  }
}

/**
 * 查询组件信息 - MCP 工具实现
 */
export function getComponentInfo(componentName: string): ComponentMetadata | null {
  const library = loadComponentLibrary()
  return library[componentName] || null
}

/**
 * 搜索组件 - 根据关键词搜索
 */
export function searchComponents(keyword: string): Array<{ name: string; metadata: ComponentMetadata }> {
  const library = loadComponentLibrary()
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
export function getAllComponentNames(): string[] {
  const library = loadComponentLibrary()
  return Object.keys(library)
}

/**
 * 获取组件推荐 - 基于使用场景
 */
export function getComponentRecommendations(scenario: string): Array<{ name: string; metadata: ComponentMetadata; score: number }> {
  const library = loadComponentLibrary()
  const recommendations: Array<{ name: string; metadata: ComponentMetadata; score: number }> = []

  for (const [name, metadata] of Object.entries(library)) {
    let score = 0

    // 简单的推荐逻辑 - 可以根据实际需求扩展
    if (scenario.includes('grid') && name.includes('grid')) score += 10
    if (scenario.includes('table') && name.includes('table')) score += 10
    if (scenario.includes('form') && name.includes('form')) score += 10
    if (scenario.includes('chart') && name.includes('chart')) score += 10

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
  handler: (args: { componentName: string }) => {
    const result = getComponentInfo(args.componentName)
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
  handler: (args: { keyword: string }) => {
    const results = searchComponents(args.keyword)
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
  handler: (args: { scenario: string }) => {
    const recommendations = getComponentRecommendations(args.scenario)
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
]