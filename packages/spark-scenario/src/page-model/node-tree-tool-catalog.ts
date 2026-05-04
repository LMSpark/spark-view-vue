import type { PageModelToolFailureMode, PageModelToolType } from './tool-contracts'

export type PageModelNodeTreeToolTarget = 'tree' | 'node' | 'children' | 'props'

export interface PageModelNodeTreeToolRow {
  action: string
  type: PageModelToolType
  target: PageModelNodeTreeToolTarget
  coreMethod: string
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
  failureModes: readonly PageModelToolFailureMode[]
}

const NO_PARAMS: Record<string, unknown> = {}
const COMPONENT_ID_PARAM = 'string — 真实节点 id；禁止把组件 type 当 componentId'
const PARENT_COMPONENT_ID_PARAM = 'string | null ? — 父节点 id；null/省略表示当前 root'
const NODE_PARAM = {
  kind: 'object',
  required: ['type'],
  properties: {
    type: 'string — 组件类型',
    id: 'string? — 节点顶层 id',
    props: 'Record<string, unknown>? — 节点属性',
    children: { kind: 'array', note: 'SparkNodeChildren?' },
  },
} as const
const INSTANCE_RULE = '动作作用于当前 PageModelHost 绑定的同一个 nodeTree 实例。'
const NAMED_PARAM_RULE = '运行时使用命名参数对象。'
const REQUEST_RULE = 'request 动作成功后必须同步回写 rule.json 当前态。'

function describe(row: Omit<PageModelNodeTreeToolRow, 'type'>): PageModelNodeTreeToolRow {
  return { type: 'describe', ...row }
}

function request(row: Omit<PageModelNodeTreeToolRow, 'type'>): PageModelNodeTreeToolRow {
  return { type: 'request', ...row }
}

function simpleFailure(code: string, when: string, fix: string): PageModelToolFailureMode {
  return { code, when, fix }
}

export const PAGE_MODEL_NODE_TREE_TOOL_ROWS = [
  describe({
    action: 'sparkNodeTree.getNode',
    target: 'node',
    coreMethod: 'getNode',
    description: '按 componentId 查找节点；未命中返回 null。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM },
    resultSchema: { node: 'SparkNode | null' },
    example: { componentId: 'table' },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.getLocation',
    target: 'node',
    coreMethod: 'getLocation',
    description: '查找节点位置，返回父节点、深度和直接索引。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM },
    resultSchema: { location: 'SparkNodeLocation | null' },
    example: { componentId: 'name-column' },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.hasNode',
    target: 'node',
    coreMethod: 'hasNode',
    description: '判断指定 componentId 是否存在。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM },
    resultSchema: { exists: 'boolean' },
    example: { componentId: 'toolbar' },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.getParent',
    target: 'node',
    coreMethod: 'getParent',
    description: '获取指定节点的直接父节点。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM },
    resultSchema: { parent: 'SparkNode | null' },
    example: { componentId: 'name-column' },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.listChildren',
    target: 'children',
    coreMethod: 'listChildren',
    description: '读取当前 root 或指定父节点的直接 children。',
    paramsSchema: { parentComponentId: PARENT_COMPONENT_ID_PARAM },
    resultSchema: { children: 'SparkNodeChildren' },
    example: { parentComponentId: null },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE],
    failureModes: [simpleFailure('PARENT_NOT_FOUND', 'parentComponentId 未命中', '先用 getNode/findByType 确认父节点 id。')],
  }),
  describe({
    action: 'sparkNodeTree.countNodes',
    target: 'tree',
    coreMethod: 'countNodes',
    description: '统计结构节点数量。',
    paramsSchema: NO_PARAMS,
    resultSchema: { count: 'number' },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.getAllData',
    target: 'tree',
    coreMethod: 'getAllData',
    description: '读取当前完整 rule.json 节点树快照。',
    paramsSchema: NO_PARAMS,
    resultSchema: { root: 'SparkNode' },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.collectHandlerNames',
    target: 'tree',
    coreMethod: 'collectHandlerNames',
    description: '收集 props.on 中出现的处理器名。',
    paramsSchema: NO_PARAMS,
    resultSchema: { handlers: 'string[]' },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE],
    failureModes: [],
  }),
  describe({
    action: 'sparkNodeTree.findByType',
    target: 'tree',
    coreMethod: 'findByType',
    description: '按组件 type 递归搜索节点，返回真实 id。',
    paramsSchema: { type: 'string — 组件类型', startComponentId: 'string?', limit: 'number?' },
    resultSchema: { matches: 'SparkNodeFindByTypeMatch[]', total: 'number' },
    example: { type: 'r-tabs' },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE],
    failureModes: [simpleFailure('START_NOT_FOUND', 'startComponentId 未命中', '省略 startComponentId 或先确认节点存在。')],
  }),
  request({
    action: 'sparkNodeTree.addNode',
    target: 'children',
    coreMethod: 'addNode',
    description: '向指定层级插入一个新节点。构造节点前必须查阅组件规格。',
    paramsSchema: { node: NODE_PARAM, parentComponentId: PARENT_COMPONENT_ID_PARAM, index: 'number?' },
    resultSchema: { node: 'SparkNode', index: 'number' },
    example: { parentComponentId: 'toolbar', node: { type: 'r-button', id: 'refresh-action' } },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('PARENT_NOT_FOUND', 'parentComponentId 未命中', '确认父节点 id 或传 null。')],
  }),
  request({
    action: 'sparkNodeTree.addNodes',
    target: 'children',
    coreMethod: 'addNodes',
    description: '向同一父节点批量插入多个节点。',
    paramsSchema: { nodes: { kind: 'array', items: NODE_PARAM }, parentComponentId: PARENT_COMPONENT_ID_PARAM, index: 'number?' },
    resultSchema: { nodes: 'SparkNode[]', indexes: 'number[]' },
    example: { parentComponentId: 'toolbar', nodes: [{ type: 'r-button', id: 'a' }] },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('INVALID_NODE_LIST', 'nodes 为空或非法', '传入非空 SparkNode 数组。')],
  }),
  request({
    action: 'sparkNodeTree.moveNode',
    target: 'children',
    coreMethod: 'moveNode',
    description: '移动已有节点到新的父节点或索引。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM, parentComponentId: PARENT_COMPONENT_ID_PARAM, index: 'number?' },
    resultSchema: { componentId: 'string', index: 'number' },
    example: { componentId: 'name-column', parentComponentId: 'table', index: 0 },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('NODE_NOT_FOUND', 'componentId 未命中', '先用 getNode/findByType 获取真实 id。')],
  }),
  request({
    action: 'sparkNodeTree.setProps',
    target: 'props',
    coreMethod: 'setProps',
    description: '写入或替换目标节点 props。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM, props: 'Record<string, unknown>', merge: 'boolean?' },
    resultSchema: { node: 'SparkNode' },
    example: { componentId: 'table', props: { stripe: true }, merge: true },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('NODE_NOT_FOUND', 'componentId 未命中', '先确认目标节点存在。')],
  }),
  request({
    action: 'sparkNodeTree.setPropsBatch',
    target: 'props',
    coreMethod: 'setPropsBatch',
    description: '批量写入多个节点 props。',
    paramsSchema: { items: { kind: 'array', items: { kind: 'object', required: ['componentId', 'props'] } } },
    resultSchema: { nodes: 'SparkNode[]' },
    example: { items: [{ componentId: 'table', props: { stripe: true } }] },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('DUPLICATE_NODE_ID', 'items 中重复 id', '去重后再提交。')],
  }),
  request({
    action: 'sparkNodeTree.replaceNode',
    target: 'node',
    coreMethod: 'replaceNode',
    description: '用新的 SparkNode 替换目标节点。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM, node: NODE_PARAM },
    resultSchema: { node: 'SparkNode', previous: 'SparkNode' },
    example: { componentId: 'name-column', node: { type: 'r-text', id: 'name-column' } },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('INVALID_NODE', 'node 非法', '保证 node 至少包含合法 type。')],
  }),
  request({
    action: 'sparkNodeTree.replaceNodes',
    target: 'node',
    coreMethod: 'replaceNodes',
    description: '批量替换多个节点。',
    paramsSchema: { items: { kind: 'array', items: { kind: 'object', required: ['componentId', 'node'] } } },
    resultSchema: { items: 'Array<{ node: SparkNode; previous: SparkNode }>' },
    example: { items: [{ componentId: 'name-column', node: { type: 'r-text', id: 'name-column' } }] },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE],
    failureModes: [simpleFailure('NODE_NOT_FOUND', 'componentId 未命中', '先确认目标节点存在。')],
  }),
  request({
    action: 'sparkNodeTree.removeNode',
    target: 'node',
    coreMethod: 'removeNode',
    description: '删除指定节点。',
    paramsSchema: { componentId: COMPONENT_ID_PARAM },
    resultSchema: { removed: 'SparkNode', index: 'number' },
    example: { componentId: 'toolbar' },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE, '不能删除根节点。'],
    failureModes: [simpleFailure('CANNOT_REMOVE_ROOT', '尝试删除根节点', '只删除根节点的子节点。')],
  }),
  request({
    action: 'sparkNodeTree.removeNodes',
    target: 'node',
    coreMethod: 'removeNodes',
    description: '批量删除多个节点。',
    paramsSchema: { componentIds: 'string[] — 目标节点 id 列表' },
    resultSchema: { items: 'Array<{ removed: SparkNode; index: number }>' },
    example: { componentIds: ['toolbar', 'name-column'] },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, REQUEST_RULE, '不能删除根节点。'],
    failureModes: [simpleFailure('DUPLICATE_NODE_ID', 'componentIds 中重复 id', '去重后再提交。')],
  }),
] as const satisfies readonly PageModelNodeTreeToolRow[]

export function getPageModelNodeTreeToolRow(action: string): PageModelNodeTreeToolRow | undefined {
  return PAGE_MODEL_NODE_TREE_TOOL_ROWS.find((row) => row.action === action)
}
