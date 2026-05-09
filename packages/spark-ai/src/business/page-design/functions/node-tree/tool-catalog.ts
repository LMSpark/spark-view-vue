import type { SparkNodeTree } from '@spark-view/spark-component'
import {
  type FunctionFailureMode,
  type LlmParamValidationOptions,
  LlmParamsValidator,
} from '../../../../core'
import {
  createPageDesignCapabilityRow,
  PageDesignToolCatalog,
} from '../tool-catalog'

type MethodKey<T> = Extract<{
  [K in keyof T]-?: T[K] extends (...args: infer _Args) => unknown ? K : never
}[keyof T], string>
type SparkNodeTreeMethodKey = MethodKey<SparkNodeTree>

export type SparkNodeTreeToolFailureMode = FunctionFailureMode
export type SparkNodeTreeToolTarget = 'tree' | 'node' | 'children' | 'props'
export type SparkNodeTreeToolAction = `pageDesign/nodeTree/${string}`
type SparkNodeTreeToolBaseFields = {
  action: SparkNodeTreeToolAction
  type: 'describe' | 'request'
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: readonly string[]
}

export type SparkNodeTreeToolParameterRow = SparkNodeTreeToolBaseFields & {
  failureModes: readonly SparkNodeTreeToolFailureMode[]
  target: SparkNodeTreeToolTarget
  coreMethod: SparkNodeTreeMethodKey
  validation?: LlmParamValidationOptions
}
export type SparkNodeTreeToolCapabilityRow = Pick<
  SparkNodeTreeToolParameterRow,
  'action' | 'type' | 'target' | 'coreMethod' | 'description'
> & {
  integrationStatus: 'catalog-only'
  paramsRef: string
  rules?: readonly string[]
  failureCodes?: readonly string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {}
const COMPONENT_ID_PARAM =
  'string — 节点的 id 值（来自 listChildren / getNode 返回结果中的顶层 id 字段）；' +
  '绝对禁止使用组件类型名（r-table、r-tabs、r-text、r-select 等）作为 componentId，类型名不是 id'
const PARENT_COMPONENT_ID_PARAM =
  'string | null ? — 父节点的 id 值（同 COMPONENT_ID_PARAM 规则）；null/省略表示当前绑定组件实例'
const INDEX_PARAM = 'number? — 插入位置；省略时追加到末尾'
const PROPS_PARAM = 'Record<string, unknown> — 要写入的 props 对象'
const NODES_PARAM = 'SparkNode[] — 按顺序插入的多个节点'
const COMPONENT_IDS_PARAM = 'string[] — 目标组件 id 列表'
const NODE_PARAM = {
  kind: 'object',
  required: ['type'],
  properties: {
    type: 'string — 组件类型',
    id: 'string? — 节点顶层 id',
    props: 'Record<string, unknown> ? — 节点属性',
    children: {
      kind: 'array',
      note: 'SparkNodeChildren ? — 子节点数组，可混合 SparkNode / string / number',
    },
  },
  note: 'node 必须是完整 SparkNode 对象，不要只传类型名字符串。',
} as const
const SET_PROPS_BATCH_ITEM_SCHEMA = {
  kind: 'object',
  required: ['componentId', 'props'],
  properties: {
    componentId: COMPONENT_ID_PARAM,
    props: PROPS_PARAM,
  },
  optional: {
    merge: 'boolean? — true=合并，false=替换；省略时默认合并',
  },
  note: '每个批处理项都必须显式提供 componentId；nodeId 参数无效。',
} as const
const SET_PROPS_BATCH_ITEMS_SCHEMA = {
  kind: 'array',
  items: SET_PROPS_BATCH_ITEM_SCHEMA,
} as const
const REPLACE_NODES_ITEM_SCHEMA = {
  kind: 'object',
  required: ['componentId', 'node'],
  properties: {
    componentId: COMPONENT_ID_PARAM,
    node: NODE_PARAM,
  },
  note: '每个替换项都必须显式提供 componentId；nodeId 参数无效。',
} as const
const REPLACE_NODES_ITEMS_SCHEMA = {
  kind: 'array',
  items: REPLACE_NODES_ITEM_SCHEMA,
} as const

const CATALOG_ONLY_RULE = '本 catalog 只定义函数目录，不接运行时 registry，也不提供 execute 实现。'
const INSTANCE_RULE = '需先通过 new SparkNodeTree({ root }) 绑定一个当前组件实例（SparkNode）；该实例既可以是页面组件，也可以是任意子组件，后续动作都作用于它的当前子树状态。'
const NAMED_PARAM_RULE = '运行时应优先使用命名参数对象，而不是位置参数。'
const DIRECT_CHILDREN_RULE = 'children 相关动作只作用于直接子节点，不递归跨层修改。'
const SCALAR_PARENT_COMPONENT_RULE = 'parentComponentId 仅接受 string 或 null 原子值，禁止对象嵌套（例如 { componentId: "root-table" }）。'
const INSTANCE_WRITE_RULE = 'SparkNodeTree 的写操作会更新当前组件实例对应的 root；如需最新子树快照，请读取 tree.root 或 toJSON()。'

type SparkNodeTreeToolRowWithoutType = Omit<SparkNodeTreeToolParameterRow, 'type'>

const defineDescribeRow = (row: SparkNodeTreeToolRowWithoutType): SparkNodeTreeToolParameterRow => ({
  type: 'describe',
  ...row,
})

const defineRequestRow = (row: SparkNodeTreeToolRowWithoutType): SparkNodeTreeToolParameterRow => ({
  type: 'request',
  ...row,
})

function toCapabilityRow(row: SparkNodeTreeToolParameterRow): SparkNodeTreeToolCapabilityRow {
  return createPageDesignCapabilityRow(row, 'catalog-only', { coreMethod: row.coreMethod })
}

const SPARK_NODE_TREE_TOOL_PARAMETER_TABLE = [
  defineDescribeRow({
    action: 'pageDesign/nodeTree/getNode',
    target: 'node',
    coreMethod: 'getNode',
    description: '按 componentId 查找节点；未命中时返回 null。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
    },
    resultSchema: {
      node: 'SparkNode | null — 命中的节点',
    },
    example: {
      componentId: 'table',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/getLocation',
    target: 'node',
    coreMethod: 'getLocation',
    description: '查找节点并返回其父节点、层级深度和直接索引位置。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
    },
    resultSchema: {
      location: 'SparkNodeLocation | null — 命中的位置信息',
    },
    example: {
      componentId: 'name-column',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/hasNode',
    target: 'node',
    coreMethod: 'hasNode',
    description: '判断指定 componentId 是否存在于当前树中。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
    },
    resultSchema: {
      exists: 'boolean — 是否存在',
    },
    example: {
      componentId: 'toolbar',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/getParent',
    target: 'node',
    coreMethod: 'getParent',
    description: '获取指定节点的直接父节点；当前绑定 root 或未命中时返回 null。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
    },
    resultSchema: {
      parent: 'SparkNode | null — 直接父节点',
    },
    example: {
      componentId: 'name-column',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/listChildren',
    target: 'children',
    coreMethod: 'listChildren',
    description: '读取当前组件实例或指定子组件的直接 children 数组。',
    paramsSchema: {
      kind: 'object',
      optional: {
        parentComponentId: PARENT_COMPONENT_ID_PARAM,
      },
      note: 'parentComponentId 必须是 string/null 原子值；省略时默认当前绑定组件实例。',
    },
    resultSchema: {
      children: 'SparkNodeChildren — 直接子节点数组',
    },
    example: {
      parentComponentId: null,
    },
    usageRules: [INSTANCE_RULE, DIRECT_CHILDREN_RULE, SCALAR_PARENT_COMPONENT_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentComponentId 未命中现有节点',
        fix: '先通过 pageDesign/nodeTree/getNode 或 pageDesign/nodeTree/hasNode 确认父节点存在。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/countNodes',
    target: 'tree',
    coreMethod: 'countNodes',
    description: '统计当前组件实例子树中的结构节点数量，不包含字符串/数字字面量子节点。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      count: 'number — 结构节点总数',
    },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/getAllData',
    target: 'tree',
    coreMethod: 'getAllData',
    description: '获取当前绑定组件实例完整子树的全部数据快照（包含递归 children）。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      root: 'SparkNode — 当前绑定组件实例完整子树快照（等价 toJSON 返回值）',
    },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/collectHandlerNames',
    target: 'tree',
    coreMethod: 'collectHandlerNames',
    description: '收集当前组件实例子树 props.on 中出现的全部唯一处理器名。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      handlers: 'Set<string> — 唯一处理器名集合',
    },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'pageDesign/nodeTree/findByType',
    target: 'tree',
    coreMethod: 'findByType',
    description:
      '按组件类型名递归搜索子树，返回所有匹配节点的真实 id、深度和父节点 id。' +
      '当知道目标组件的 type（如 r-tabs、r-form）但不知道其节点 id 时，用本动作代替多步 listChildren→getNode，' +
      '一次拿到可直接用于 setProps / removeNode 的真实 componentId。',
    paramsSchema: {
      kind: 'object',
      required: ['type'],
      properties: {
        type: 'string — 组件类型名（如 r-tabs、r-form、r-table），精确匹配',
      },
      optional: {
        startComponentId:
          'string? — 从哪个节点开始向下搜索（必须是真实节点 id，不能是类型名）；省略时从根节点开始',
        limit: 'number? — 最多返回多少条匹配，省略时不限制',
      },
    },
    resultSchema: {
      matches: 'SparkNodeFindByTypeMatch[] — 匹配节点列表，每项包含 id / type / depth / parentId',
      total: 'number — 实际命中总数（受 limit 截断前）',
    },
    example: {
      type: 'r-tabs',
    },
    usageRules: [
      INSTANCE_RULE,
      NAMED_PARAM_RULE,
      CATALOG_ONLY_RULE,
      '返回的 matches[n].id 即为真实 componentId，可直接传给 getNode / setProps / removeNode；' +
        '仅当 id 为 undefined 时表示该节点未设置 id，需改用 index 定位。',
    ],
    failureModes: [
      {
        code: 'START_NOT_FOUND',
        when: 'startComponentId 未命中现有节点',
        fix: '先通过 pageDesign/nodeTree/hasNode 确认 startComponentId 存在，或省略 startComponentId 从根节点开始搜索。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/addNode',
    target: 'children',
    coreMethod: 'addNode',
    description: '向指定层级插入一个新节点。警告：入参 node 必须是完整合法的 SparkNode 实例。在构造之前，必须先用 pageDesign/knowledge/guidePayload 查阅过该 type 的 props schema。绝对禁止凭空猜测 props。',
    paramsSchema: {
      kind: 'object',
      required: ['node'],
      properties: {
        node: NODE_PARAM,
      },
      optional: {
        parentComponentId: PARENT_COMPONENT_ID_PARAM,
        index: INDEX_PARAM,
      },
      note: 'node 为必填；parentComponentId 必须是 string/null 原子值。',
    },
    resultSchema: {
      node: 'SparkNode — 新插入的节点',
      index: 'number — 实际插入位置',
    },
    example: {
      parentComponentId: 'toolbar',
      node: { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
    },
    usageRules: [INSTANCE_RULE, SCALAR_PARENT_COMPONENT_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentComponentId 未命中现有节点',
        fix: '先确认父组件 id，或把 parentComponentId 置为 null 直接挂到当前绑定组件实例。',
      },
      {
        code: 'INVALID_NODE',
        when: 'node 缺少必要字段，例如 type 为空',
        fix: '至少传入合法的 SparkNode.type，并保证 node 是完整对象。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/addNodes',
    target: 'children',
    coreMethod: 'addNodes',
    description: '向同一个子组件容器批量插入多个新节点。警告：入参 nodes 必须是由指定 type 的 props schema 组装而成的合法 SparkNode 数组。构造前必须查阅组件规格，绝对禁止凭空猜测 props。',
    paramsSchema: {
      kind: 'object',
      required: ['nodes'],
      properties: {
        nodes: NODES_PARAM,
      },
      optional: {
        parentComponentId: PARENT_COMPONENT_ID_PARAM,
        index: INDEX_PARAM,
      },
      note: 'nodes 为必填；parentComponentId 必须是 string/null 原子值。',
    },
    resultSchema: {
      nodes: 'SparkNode[] — 按传入顺序成功插入的节点',
      indexes: 'number[] — 每个节点的实际插入位置',
    },
    example: {
      parentComponentId: 'toolbar',
      nodes: [
        { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
        { type: 'r-button', id: 'export-action', props: { action: 'export' } },
      ],
    },
    usageRules: [INSTANCE_RULE, SCALAR_PARENT_COMPONENT_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentComponentId 未命中现有节点',
        fix: '先确认父组件存在，或把 parentComponentId 置为 null。',
      },
      {
        code: 'INVALID_NODE_LIST',
        when: 'nodes 为空数组，或某个节点不是合法 SparkNode',
        fix: '保证 nodes 至少包含一个完整 SparkNode 对象。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/moveNode',
    target: 'children',
    coreMethod: 'moveNode',
    description: '把已有节点移动到新的父节点或兄弟位置。用于调整布局顺序或容器归属，避免 removeNode + addNode 重建已有子树造成大块文本输出。',
    paramsSchema: {
      kind: 'object',
      required: ['componentId'],
      properties: {
        componentId: COMPONENT_ID_PARAM,
      },
      optional: {
        parentComponentId: PARENT_COMPONENT_ID_PARAM,
        index: INDEX_PARAM,
      },
      note: 'componentId 是要移动的现有节点；parentComponentId 是目标父节点，省略/null 表示当前绑定组件实例；index 是目标父节点 children 中的最终插入位置。',
    },
    resultSchema: {
      componentId: 'string — 被移动节点 id',
      fromParentComponentId: 'string | null — 移动前父节点 id；null 表示当前绑定组件实例',
      toParentComponentId: 'string | null — 移动后父节点 id；null 表示当前绑定组件实例',
      previousIndex: 'number — 移动前在原父节点 children 中的索引',
      index: 'number — 移动后在目标父节点 children 中的索引',
    },
    example: {
      componentId: 'name-column',
      parentComponentId: 'table',
      index: 0,
    },
    usageRules: [
      INSTANCE_RULE,
      SCALAR_PARENT_COMPONENT_RULE,
      NAMED_PARAM_RULE,
      INSTANCE_WRITE_RULE,
      '调整已有节点位置时优先使用 moveNode，不要用 removeNode + addNode 复制完整子树。',
      'moveNode 返回移动摘要，不返回完整 SparkNode 子树，避免上下文膨胀。',
      '不能移动根节点，也不能把节点移动到自身或其后代节点下面。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'componentId 未命中现有节点',
        fix: '先通过 pageDesign/nodeTree/getNode 或 pageDesign/nodeTree/findByType 获取真实 componentId。',
      },
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentComponentId 未命中现有节点',
        fix: '先确认目标父节点存在，或省略 parentComponentId 移动到当前绑定组件实例。',
      },
      {
        code: 'CANNOT_MOVE_ROOT',
        when: '尝试移动当前绑定 root 节点',
        fix: '只能移动 root 的子节点；如需整体替换 root，请使用 replaceRoot 类能力。',
      },
      {
        code: 'CANNOT_MOVE_INTO_DESCENDANT',
        when: '目标父节点是被移动节点自身或其后代',
        fix: '选择被移动节点外部的父节点作为 parentComponentId。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/setProps',
    target: 'props',
    coreMethod: 'setProps',
    description: '写入或替换目标节点的 props。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
      props: PROPS_PARAM,
      merge: 'boolean? — true=合并，false=替换；省略时默认合并',
    },
    resultSchema: {
      node: 'SparkNode — props 已更新的节点',
    },
    example: {
      componentId: 'table',
      props: { stripe: true },
      merge: true,
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'componentId 未命中现有节点',
        fix: '先通过 pageDesign/nodeTree/getNode 或 pageDesign/nodeTree/hasNode 确认目标节点存在。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/setPropsBatch',
    target: 'props',
    coreMethod: 'setPropsBatch',
    description: '批量写入多个节点的 props，整个批次只提交一次树状态。',
    paramsSchema: {
      items: SET_PROPS_BATCH_ITEMS_SCHEMA,
    },
    resultSchema: {
      nodes: 'SparkNode[] — props 已更新的节点数组',
    },
    example: {
      items: [
        { componentId: 'table', props: { stripe: true }, merge: true },
        { componentId: 'toolbar', props: { class: 'toolbar-wide' }, merge: true },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 componentId 未命中现有节点',
        fix: '执行前先用 pageDesign/nodeTree/hasNode 批量确认目标节点存在。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'items 中重复出现同一个 componentId',
        fix: '同一批次内每个 componentId 只保留一条更新。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/replaceNode',
    target: 'node',
    coreMethod: 'replaceNode',
    description: '用新的 SparkNode 替换目标节点。警告：新的 node 必须由合法 type 并依据 specs 构建，查阅 pageDesign/knowledge/guidePayload 确认配置结构后再替换，避免配置污染。返回新节点和被替换的旧节点。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
      node: NODE_PARAM,
    },
    resultSchema: {
      node: 'SparkNode — 替换后的新节点',
      previous: 'SparkNode — 被替换的旧节点',
    },
    example: {
      componentId: 'name-column',
      node: { type: 'el-table-column', id: 'name-column', props: { field: 'displayName' } },
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'componentId 未命中现有节点',
        fix: '先确认目标节点存在，再执行 replace。',
      },
      {
        code: 'INVALID_NODE',
        when: 'node 不是合法 SparkNode',
        fix: '保证 node 至少含有合法 type，必要时保留原 id。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/replaceNodes',
    target: 'node',
    coreMethod: 'replaceNodes',
    description: '批量替换多个节点，适合一次性重建多个字段或容器节点。',
    paramsSchema: {
      items: REPLACE_NODES_ITEMS_SCHEMA,
    },
    resultSchema: {
      items: 'Array<{ node: SparkNode; previous: SparkNode }> — 每个替换项的新旧节点结果',
    },
    example: {
      items: [
        { componentId: 'name-column', node: { type: 'el-table-column', id: 'name-column', props: { field: 'displayName' } } },
        { componentId: 'toolbar', node: { type: 'r-toolbar', id: 'toolbar', props: { dense: true } } },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 componentId 未命中现有节点',
        fix: '先确认目标节点存在，再执行 replaceNodes。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'items 中重复出现同一个 componentId',
        fix: '同一批次内同一个节点只保留一次 replace。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/removeNode',
    target: 'node',
    coreMethod: 'removeNode',
    description: '删除当前组件实例子树内的指定节点，并返回被删除节点和原始索引。',
    paramsSchema: {
      componentId: COMPONENT_ID_PARAM,
    },
    resultSchema: {
      removed: 'SparkNode — 被删除的节点',
      index: 'number — 删除前在父节点 children 中的索引',
    },
    example: {
      componentId: 'toolbar',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, '不能删除根节点。', CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'componentId 未命中现有节点',
        fix: '先确认目标节点存在。',
      },
      {
        code: 'CANNOT_REMOVE_ROOT',
        when: '尝试删除根节点',
        fix: '只删除根节点的子节点，或重新创建 SparkNodeTree 实例并替换整个 root。',
      },
    ],
  }),
  defineRequestRow({
    action: 'pageDesign/nodeTree/removeNodes',
    target: 'node',
    coreMethod: 'removeNodes',
    description: '按 componentIds 批量删除当前组件实例子树内的多个节点，整个批次只提交一次树状态。',
    paramsSchema: {
      componentIds: COMPONENT_IDS_PARAM,
    },
    resultSchema: {
      items: 'Array<{ removed: SparkNode; index: number }> — 每个删除项的结果',
    },
    example: {
      componentIds: ['toolbar', 'name-column'],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, '不能删除根节点。', CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 componentId 未命中现有节点',
        fix: '先确认 componentIds 全部存在。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'componentIds 中出现重复 id',
        fix: '去重后再提交删除批次。',
      },
      {
        code: 'CANNOT_REMOVE_ROOT',
        when: 'componentIds 中包含根节点',
        fix: '只删除根节点的子节点。',
      },
    ],
  }),
] as const satisfies readonly SparkNodeTreeToolParameterRow[]

const SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE: readonly SparkNodeTreeToolCapabilityRow[] =
  SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map(toCapabilityRow)

export class PageDesignNodeTreeCatalog extends PageDesignToolCatalog<
  SparkNodeTreeToolParameterRow,
  SparkNodeTreeToolCapabilityRow
> {
  constructor() {
    super(SPARK_NODE_TREE_TOOL_PARAMETER_TABLE, SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE)
  }

  validateParams(action: string, params: unknown): string | null {
    const row = this.getParameterRow(action)
    if (row === undefined) {
      return `未知 nodeTree 动作: ${action}`
    }

    const result = LlmParamsValidator.validateLlmDeserializedParams(params, row.paramsSchema, row.validation)
    return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
  }
}
