import { PAGE_MODEL_NODE_TREE_TOOL_ROWS, type PageModelNodeTreeToolRow } from './node-tree-tool-catalog'
import { createPageModelFunction, pageModelToolFailure, type PageModelToolFamily } from './tool-contracts'

type DispatchRecord = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('rule.json root 必须是对象。')
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function nodeId(node: Record<string, unknown>): string | undefined {
  const id = node['id']
  return typeof id === 'string' && id.trim() !== '' ? id : undefined
}

function childrenOf(node: Record<string, unknown>): unknown[] {
  const children = node['children']
  if (children === undefined) return []
  if (!Array.isArray(children)) throw new Error('children 必须是数组。')
  return children
}

function findNode(root: Record<string, unknown>, componentId: string): Record<string, unknown> | null {
  if (nodeId(root) === componentId) return root
  for (const child of childrenOf(root)) {
    if (!isRecord(child)) continue
    const match = findNode(child, componentId)
    if (match !== null) return match
  }
  return null
}

function findParent(root: Record<string, unknown>, componentId: string): Record<string, unknown> | null {
  for (const child of childrenOf(root)) {
    if (!isRecord(child)) continue
    if (nodeId(child) === componentId) return root
    const match = findParent(child, componentId)
    if (match !== null) return match
  }
  return null
}

function resolveParent(root: Record<string, unknown>, parentComponentId: unknown): Record<string, unknown> {
  if (parentComponentId === undefined || parentComponentId === null) return root
  if (typeof parentComponentId !== 'string' || parentComponentId.trim() === '') {
    throw new Error('parentComponentId 必须是 string 或 null。')
  }
  const parent = findNode(root, parentComponentId)
  if (parent === null) throw new Error(`parentComponentId not found: ${parentComponentId}`)
  return parent
}

function requireArgsRecord(args: unknown): Record<string, unknown> {
  if (args === undefined) return {}
  if (!isRecord(args)) throw new Error('参数必须是对象。')
  return args
}

function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`缺少 ${key}（string）。`)
  return value
}

function requireNodeArg(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key]
  if (!isRecord(value) || typeof value['type'] !== 'string' || value['type'].trim() === '') {
    throw new Error(`缺少 ${key}.type。`)
  }
  return value
}

function countNodes(root: Record<string, unknown>): number {
  return 1 + childrenOf(root).reduce<number>((total, child) => total + (isRecord(child) ? countNodes(child) : 0), 0)
}

function findByType(root: Record<string, unknown>, type: string, matches: Array<Record<string, unknown>>, depth = 0): void {
  if (root['type'] === type) {
    matches.push({ id: nodeId(root), type, depth })
  }
  for (const child of childrenOf(root)) {
    if (isRecord(child)) findByType(child, type, matches, depth + 1)
  }
}

function executeJsonNodeTree(row: PageModelNodeTreeToolRow, args: unknown, rootValue: unknown): { data: unknown; nextRoot?: unknown } {
  const root = cloneRecord(rootValue)
  const params = requireArgsRecord(args)
  switch (row.action) {
    case 'sparkNodeTree.getAllData':
      return { data: root }
    case 'sparkNodeTree.countNodes':
      return { data: countNodes(root) }
    case 'sparkNodeTree.getNode':
      return { data: findNode(root, requireStringArg(params, 'componentId')) }
    case 'sparkNodeTree.hasNode':
      return { data: findNode(root, requireStringArg(params, 'componentId')) !== null }
    case 'sparkNodeTree.getParent':
      return { data: findParent(root, requireStringArg(params, 'componentId')) }
    case 'sparkNodeTree.listChildren':
      return { data: [...childrenOf(resolveParent(root, params['parentComponentId']))] }
    case 'sparkNodeTree.findByType': {
      const matches: Array<Record<string, unknown>> = []
      findByType(root, requireStringArg(params, 'type'), matches)
      const limit = typeof params['limit'] === 'number' ? params['limit'] : undefined
      return { data: { matches: limit === undefined ? matches : matches.slice(0, limit), total: matches.length } }
    }
    case 'sparkNodeTree.addNode': {
      const parent = resolveParent(root, params['parentComponentId'])
      const children = childrenOf(parent)
      const node = requireNodeArg(params, 'node')
      const index = typeof params['index'] === 'number' ? params['index'] : children.length
      children.splice(index, 0, node)
      parent['children'] = children
      return { data: { node, index }, nextRoot: root }
    }
    case 'sparkNodeTree.setProps': {
      const node = findNode(root, requireStringArg(params, 'componentId'))
      if (node === null) throw new Error(`componentId not found: ${params['componentId']}`)
      const props = params['props']
      if (!isRecord(props)) throw new Error('props 必须是对象。')
      node['props'] = params['merge'] === false ? props : { ...(isRecord(node['props']) ? node['props'] : {}), ...props }
      return { data: { node }, nextRoot: root }
    }
    default:
      throw new Error(`当前 JSON headless nodeTree 暂未实现 ${row.action}；真实 UI host 可提供 ${row.coreMethod} 方法承接。`)
  }
}

function readRootFromRuntime(runtime: unknown): unknown {
  if (!isRecord(runtime)) return undefined
  const getAllData = runtime['getAllData']
  if (typeof getAllData === 'function') return getAllData.call(runtime) as unknown
  const toJSON = runtime['toJSON']
  if (typeof toJSON === 'function') return toJSON.call(runtime) as unknown
  return runtime['root']
}

function executeNodeTreeRow(row: PageModelNodeTreeToolRow, args: unknown, runtime: unknown): { data: unknown; nextRoot?: unknown } {
  const member = isRecord(runtime) ? (runtime as DispatchRecord)[row.coreMethod] : undefined
  if (typeof member === 'function') {
    const data = Object.keys(row.paramsSchema).length === 0
      ? member.call(runtime) as unknown
      : member.call(runtime, args ?? {}) as unknown
    return { data, nextRoot: row.type === 'request' ? readRootFromRuntime(runtime) : undefined }
  }
  return executeJsonNodeTree(row, args, runtime)
}

function buildSummary(row: PageModelNodeTreeToolRow, data: unknown): string {
  if (row.action === 'sparkNodeTree.countNodes' && typeof data === 'number') return `${row.action} 完成（count=${data}）`
  return `${row.action} 完成`
}

export function createSparkNodeTreeToolFamily(): PageModelToolFamily {
  return {
    name: 'sparkNodeTree',
    title: '页面节点树工具',
    description: '负责 rule.json 的节点树查询和写入。',
    rules: ['sparkNodeTree 是 rule.json 的领域工具族，函数规格来自旧 SparkNodeTree stills catalog。'],
    functions: PAGE_MODEL_NODE_TREE_TOOL_ROWS.map((row) => createPageModelFunction({
      action: row.action,
      type: row.type,
      description: row.description,
      paramsSchema: row.paramsSchema,
      resultSchema: row.resultSchema,
      example: row.example,
      usageRules: row.usageRules,
      failureModes: row.failureModes,
      ...(row.type === 'request' ? { persistAfterExecute: 'success' as const } : {}),
      execute: ({ host, args }) => {
        try {
          const result = executeNodeTreeRow(row, args, host.getNodeTree())
          if (row.type === 'request' && result.nextRoot !== undefined) {
            host.setNodeTree(result.nextRoot)
          }
          return { data: result.data, summary: buildSummary(row, result.data) }
        } catch (error) {
          return pageModelToolFailure({
            code: 'NODE_TREE_EXECUTE_ERROR',
            msg: error instanceof Error ? error.message : String(error),
            fix: `按 ${row.action} 的参数规格重试：${JSON.stringify(row.paramsSchema)}`,
          })
        }
      },
    })),
  }
}
