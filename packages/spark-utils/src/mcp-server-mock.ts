#!/usr/bin/env node

/**
 * MCP 服务器 Mock - 组件库查询服务
 *
 * 模拟 MCP (Model Context Protocol) 服务器，提供组件元数据查询功能
 * 用于演示 AI 如何通过工具获取组件信息
 */

import { componentLibraryTools, getAllComponentNames, getComponentInfo } from './tools/componentLibraryTool.js'

console.warn('🚀 SPARK 组件库 MCP 服务器启动')
console.info('📚 可用组件:', (await getAllComponentNames()).length)
console.info('🛠️  可用工具:', componentLibraryTools.map(t => t.name).join(', '))
console.info('')

// 模拟一些查询示例
console.info('📋 演示查询示例:')
console.info('')

// 示例1: 查询特定组件
const gridComponent = await getComponentInfo('SparkEJ2Grid')
if (gridComponent) {
  console.info('🔍 查询组件: SparkEJ2Grid')
  console.info('   Props:', gridComponent.props?.length ?? 0)
  console.info('   Events:', gridComponent.events?.length ?? 0)
  console.info('   Mock:', gridComponent.isMock ? '是' : '否')
  console.info('')
}

// 示例2: 模拟工具调用
console.info('🛠️  模拟工具调用:')

// 模拟 get-component-info 工具
const toolResult1 = await componentLibraryTools[0]?.handler({ componentName: 'SparkEJ2Grid' })
console.info('get-component-info(SparkEJ2Grid):', toolResult1?.success ? '成功' : '失败')

// 模拟 search-components 工具
const toolResult2 = await componentLibraryTools[1]?.handler({ keyword: 'grid' })
console.info('search-components("grid"):', Array.isArray(toolResult2?.data) ? toolResult2.data.length : 0, '个结果')

// 模拟 recommend-components 工具
const toolResult3 = await componentLibraryTools[2]?.handler({ scenario: '显示数据表格' })
console.info('recommend-components("显示数据表格"):', Array.isArray(toolResult3?.data) ? toolResult3.data.length : 0, '个推荐')

console.info('')
console.info('✅ MCP 服务器就绪，可以接收 AI 查询请求')

// 在实际项目中，这里会启动 HTTP/WebSocket 服务器监听请求
// 这里只是演示，实际使用时会集成到 MCP 服务器中

export { componentLibraryTools }