/**
 * Pages Config 格式加载器
 * 支持 pages-config 标准格式：rule.json + pagedata.json + script.js
 */

/**
 * Pages Config 节点格式
 */
export interface PagesConfigNode {
  type: string
  id?: string
  class?: string | string[]
  style?: Record<string, unknown>
  props?: Record<string, unknown>
  children?: PagesConfigNode[] | string[]
  /** 数据绑定路径 */
  dataKey?: string
  /** 事件处理器（函数名） */
  on?: Record<string, string>
  /** 循环渲染配置 */
  _loop?: {
    item: string
    template: PagesConfigNode
  }
  /** 条件渲染函数名 */
  _condition?: string
  /** 数据转换函数名 */
  _transform?: string
}

/**
 * 加载 pages-config 格式配置
 */
export async function loadPagesConfig(baseUrl: string) {
  const [rule, pagedata, scriptText] = await Promise.all([
    fetch(`${baseUrl}/rule.json`).then(r => r.json()),
    fetch(`${baseUrl}/pagedata.json`).then(r => r.json()),
    fetch(`${baseUrl}/script.js`).then(r => r.text()).catch(() => '')
  ])

  // 解析脚本（注意：这里只是加载文本，实际执行在沙箱中）
  const scriptFunctions = parseScriptFunctions(scriptText)

  return {
    rule: Array.isArray(rule) ? rule : [rule],
    pagedata,
    scriptFunctions,
    scriptText
  }
}

/**
 * 从脚本文本中提取函数名（仅用于验证）
 */
function parseScriptFunctions(scriptText: string): string[] {
  const functionNames: string[] = []
  const functionPattern = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g
  let match

  while ((match = functionPattern.exec(scriptText)) !== null) {
    if (match[1]) {
      functionNames.push(match[1])
    }
  }

  return functionNames
}

/**
 * 将 pages-config 格式转换为渲染树
 */
export function transformPagesConfig(
  nodes: PagesConfigNode[],
  pagedata: Record<string, unknown>,
  scriptContext: Record<string, Function>
): any[] {
  return nodes.map(node => transformNode(node, pagedata, scriptContext))
}

/**
 * 转换单个节点
 */
function transformNode(
  node: PagesConfigNode,
  pagedata: Record<string, unknown>,
  scriptContext: Record<string, Function>,
  loopContext?: Record<string, unknown>
): any {
  // 条件渲染
  if (node._condition) {
    const conditionFn = scriptContext[node._condition]
    if (conditionFn && !conditionFn(pagedata, loopContext)) {
      return null
    }
  }

  // 获取数据值
  let dataValue = undefined
  if (node.dataKey) {
    dataValue = resolveDataPath(node.dataKey, pagedata, loopContext)
  }

  // 处理循环渲染
  if (node._loop && Array.isArray(dataValue)) {
    return dataValue.map((item) => {
      const itemContext = { [node._loop!.item]: item }
      return transformNode(node._loop!.template, pagedata, scriptContext, {
        ...loopContext,
        ...itemContext
      })
    })
  }

  // 转换子节点
  let children = node.children
  if (children) {
    children = children.map(child => {
      if (typeof child === 'string') {
        return child
      }
      return transformNode(child, pagedata, scriptContext, loopContext)
    }).flat().filter(c => c !== null)
  }

  // 处理事件
  const events: Record<string, Function> = {}
  if (node.on) {
    for (const [eventName, fnName] of Object.entries(node.on)) {
      const fn = scriptContext[fnName]
      if (fn) {
        events[eventName] = fn
      }
    }
  }

  // 构建节点对象
  const result: any = {
    type: node.type,
    props: {
      ...node.props,
      class: node.class,
      style: node.style
    }
  }

  // 处理数据转换
  if (node._transform && dataValue !== undefined) {
    const transformFn = scriptContext[node._transform]
    if (transformFn) {
      dataValue = transformFn(dataValue, pagedata, loopContext)
    }
  }

  // 设置文本内容或子节点
  if (dataValue !== undefined && !children?.length) {
    result.children = [String(dataValue)]
  } else if (children?.length) {
    result.children = children
  }

  // 添加事件处理器
  if (Object.keys(events).length > 0) {
    result.on = events
  }

  return result
}

/**
 * 解析数据路径（支持 user.name, items[0].title 等）
 */
function resolveDataPath(
  path: string,
  pagedata: Record<string, unknown>,
  loopContext?: Record<string, unknown>
): any {
  const parts = path.split('.')
  let current: any = { ...pagedata, ...loopContext }

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[part]
  }

  return current
}

/**
 * 创建默认脚本上下文
 */
export function createDefaultScriptContext(
  _pagedata: Record<string, unknown>
): Record<string, Function> {
  return {
    // 条件函数
    isActive: (data: any, loop: any) => {
      const status = loop?.user?.status || data?.status
      return status === 'active'
    },
    notReadonly: (data: any) => !data.readonly,
    hasUsers: (data: any) => data.users && data.users.length > 0,

    // 转换函数
    statusText: (value: string) => value === 'active' ? '在线' : '离线',
    statusIcon: (value: string) => value === 'active' ? '🟢' : '🔴',

    // 事件处理器（这些会被组件的实际处理器覆盖）
    handleRefresh: () => console.info('🔄 刷新'),
    handleSelectAll: () => console.info('☑️ 全选'),
    handleEdit: (e: any) => console.info('✏️ 编辑:', e),
    handleDelete: (e: any) => console.info('🗑️ 删除:', e)
  }
}
