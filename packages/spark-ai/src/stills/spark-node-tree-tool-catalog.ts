/**
 * SparkNodeTree → Core Tool Catalog
 *
 * 目标：
 * 1. 把 SparkNodeTree 的公开能力整理成一份核心层可消费的动作目录；
 * 2. 提供参数规格、结果结构、使用规则与失败模式，作为未来宿主接线的事实源；
 * 3. 只做 catalog，不接 spark-ai stills registry，也不提供 execute 实现；
 * 4. 目录语义与实例版 SparkNodeTree 保持一致：先绑定一个当前组件实例，再对该组件及其子树执行动作。
 * 5. 当前组件实例可以是页面组件，也可以是任意子组件；页面只是递归 SparkNode 模型中的一个特例。
 */

/** 单个动作的结构化失败模式。 */
export interface SparkNodeTreeToolFailureMode {
  code: string
  when: string
  fix: string
}

/** 动作类型：变更树状态用 request，只读查询用 describe。 */
export type SparkNodeTreeToolType = 'request' | 'describe'

/** 动作主要作用目标，用于目录分组。 */
export type SparkNodeTreeToolTarget = 'tree' | 'node' | 'children' | 'props'

/** 完整参数表行：作为 catalog 的事实源。 */
export interface SparkNodeTreeToolParameterRow {
  action: string
  type: SparkNodeTreeToolType
  target: SparkNodeTreeToolTarget
  coreMethod: string
  description: string
  paramsSchema: Record<string, unknown>
  resultSchema: Record<string, unknown>
  example: Record<string, unknown>
  usageRules: string[]
  failureModes: SparkNodeTreeToolFailureMode[]
}

/** 目录页能力行：完整规格由参数表提供，此处只保留摘要字段。 */
export interface SparkNodeTreeToolCapabilityRow {
  action: string
  type: SparkNodeTreeToolType
  target: SparkNodeTreeToolTarget
  coreMethod: string
  description: string
  integrationStatus: 'catalog-only'
  paramsRef: string
  rules?: string[]
  failureCodes?: string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

const NO_PARAMS: Record<string, unknown> = {}
const NODE_ID_PARAM = 'string — 当前组件子树内的节点 id'
const PARENT_ID_PARAM = 'string | null ? — 父节点 id；null/省略表示当前绑定组件实例'
const INDEX_PARAM = 'number? — 插入位置；省略时追加到末尾'
const PROPS_PARAM = 'Record<string, unknown> — 要写入的 props 对象'
const NODES_PARAM = 'SparkNode[] — 按顺序插入的多个节点'
const NODE_IDS_PARAM = 'string[] — 目标节点 id 列表'
const SET_PROPS_BATCH_ITEMS_PARAM = 'Array<{ nodeId: string; props: Record<string, unknown>; merge?: boolean }>'
const REPLACE_NODES_ITEMS_PARAM = 'Array<{ nodeId: string; node: SparkNode }>'
const NODE_PARAM = {
  kind: 'object',
  required: ['type'],
  properties: {
    type: 'string — 组件类型',
    id: 'string? — 节点 id；建议由宿主提供稳定 id',
    props: 'Record<string, unknown> ? — 节点属性',
    children: 'SparkNodeChildren ? — 子节点数组，可混合 SparkNode / string / number',
  },
  note: 'node 必须是完整 SparkNode 对象，不要只传类型名字符串。',
} as const
const CHILD_IDS_PARAM = 'string[] — 目标组件下的直接子节点新顺序'

const CATALOG_ONLY_RULE = '本 catalog 只定义核心层动作目录，不接 spark-ai stills registry，也不提供 execute 实现。'
const INSTANCE_RULE = '需先通过 new SparkNodeTree({ root }) 绑定一个当前组件实例（SparkNode）；该实例既可以是页面组件，也可以是任意子组件，后续动作都作用于它的当前子树状态。'
const NAMED_PARAM_RULE = '运行时应优先使用命名参数对象，而不是位置参数。'
const DIRECT_CHILDREN_RULE = 'children 相关动作只作用于直接子节点，不递归跨层修改。'
const INSTANCE_WRITE_RULE = 'SparkNodeTree 的写操作会更新当前组件实例对应的 root；如需最新子树快照，请读取 tree.root 或 toJSON()。'

function defineDescribeRow(
  row: Omit<SparkNodeTreeToolParameterRow, 'type'>,
): SparkNodeTreeToolParameterRow {
  return {
    type: 'describe',
    ...row,
  }
}

function defineRequestRow(
  row: Omit<SparkNodeTreeToolParameterRow, 'type'>,
): SparkNodeTreeToolParameterRow {
  return {
    type: 'request',
    ...row,
  }
}

function toCapabilityRow(row: SparkNodeTreeToolParameterRow): SparkNodeTreeToolCapabilityRow {
  return {
    action: row.action,
    type: row.type,
    target: row.target,
    coreMethod: row.coreMethod,
    description: row.description,
    integrationStatus: 'catalog-only',
    paramsRef: row.action,
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map(item => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
}

export const SPARK_NODE_TREE_TOOL_PARAMETER_TABLE = [
  defineDescribeRow({
    action: 'sparkNodeTree.getNode',
    target: 'node',
    coreMethod: 'getNode',
    description: '按 nodeId 查找节点；未命中时返回 null。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
    },
    resultSchema: {
      node: 'SparkNode | null — 命中的节点',
    },
    example: {
      nodeId: 'table',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'sparkNodeTree.getLocation',
    target: 'node',
    coreMethod: 'getLocation',
    description: '查找节点并返回其父节点、层级深度和直接索引位置。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
    },
    resultSchema: {
      location: 'SparkNodeLocation | null — 命中的位置信息',
    },
    example: {
      nodeId: 'name-column',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'sparkNodeTree.hasNode',
    target: 'node',
    coreMethod: 'hasNode',
    description: '判断指定 nodeId 是否存在于当前树中。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
    },
    resultSchema: {
      exists: 'boolean — 是否存在',
    },
    example: {
      nodeId: 'toolbar',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'sparkNodeTree.getParent',
    target: 'node',
    coreMethod: 'getParent',
    description: '获取指定节点的直接父节点；当前绑定 root 或未命中时返回 null。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
    },
    resultSchema: {
      parent: 'SparkNode | null — 直接父节点',
    },
    example: {
      nodeId: 'name-column',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'sparkNodeTree.listChildren',
    target: 'children',
    coreMethod: 'listChildren',
    description: '读取当前组件实例或指定子组件的直接 children 数组。',
    paramsSchema: {
      parentId: PARENT_ID_PARAM,
    },
    resultSchema: {
      children: 'SparkNodeChildren — 直接子节点数组',
    },
    example: {
      parentId: null,
    },
    usageRules: [INSTANCE_RULE, DIRECT_CHILDREN_RULE, NAMED_PARAM_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentId 未命中现有节点',
        fix: '先通过 sparkNodeTree.getNode 或 sparkNodeTree.hasNode 确认父节点存在。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'sparkNodeTree.countNodes',
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
    action: 'sparkNodeTree.collectDataKeys',
    target: 'tree',
    coreMethod: 'collectDataKeys',
    description: '收集当前组件实例子树 props.dataKey 中出现的全部唯一 dataKey。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataKeys: 'Set<string> — 唯一 dataKey 集合',
    },
    example: NO_PARAMS,
    usageRules: [INSTANCE_RULE, CATALOG_ONLY_RULE],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'sparkNodeTree.collectHandlerNames',
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
  defineRequestRow({
    action: 'sparkNodeTree.addNode',
    target: 'children',
    coreMethod: 'addNode',
    description: '向当前组件实例或指定子组件的 children 中插入一个新节点。',
    paramsSchema: {
      parentId: PARENT_ID_PARAM,
      node: NODE_PARAM,
      index: INDEX_PARAM,
    },
    resultSchema: {
      node: 'SparkNode — 新插入的节点',
      index: 'number — 实际插入位置',
    },
    example: {
      parentId: 'toolbar',
      node: { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentId 未命中现有节点',
        fix: '先确认父节点 id，或把 parentId 置为 null 直接挂到当前绑定组件实例。',
      },
      {
        code: 'INVALID_NODE',
        when: 'node 缺少必要字段，例如 type 为空',
        fix: '至少传入合法的 SparkNode.type，并保证 node 是完整对象。',
      },
    ],
  }),
  defineRequestRow({
    action: 'sparkNodeTree.addNodes',
    target: 'children',
    coreMethod: 'addNodes',
    description: '向同一个子组件容器批量插入多个新节点，减少逐个 addNode 的多轮调用。',
    paramsSchema: {
      parentId: PARENT_ID_PARAM,
      nodes: NODES_PARAM,
      index: INDEX_PARAM,
    },
    resultSchema: {
      nodes: 'SparkNode[] — 按传入顺序成功插入的节点',
      indexes: 'number[] — 每个节点的实际插入位置',
    },
    example: {
      parentId: 'toolbar',
      nodes: [
        { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
        { type: 'r-button', id: 'export-action', props: { action: 'export' } },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentId 未命中现有节点',
        fix: '先确认父节点存在，或把 parentId 置为 null。',
      },
      {
        code: 'INVALID_NODE_LIST',
        when: 'nodes 为空数组，或某个节点不是合法 SparkNode',
        fix: '保证 nodes 至少包含一个完整 SparkNode 对象。',
      },
    ],
  }),
  defineRequestRow({
    action: 'sparkNodeTree.setProps',
    target: 'props',
    coreMethod: 'setProps',
    description: '写入或替换目标节点的 props。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
      props: PROPS_PARAM,
      merge: 'boolean? — true=合并，false=替换；省略时默认合并',
    },
    resultSchema: {
      node: 'SparkNode — props 已更新的节点',
    },
    example: {
      nodeId: 'table',
      props: { stripe: true },
      merge: true,
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'nodeId 未命中现有节点',
        fix: '先通过 sparkNodeTree.getNode 或 sparkNodeTree.hasNode 确认目标节点存在。',
      },
    ],
  }),
  defineRequestRow({
    action: 'sparkNodeTree.setPropsBatch',
    target: 'props',
    coreMethod: 'setPropsBatch',
    description: '批量写入多个节点的 props，整个批次只提交一次树状态。',
    paramsSchema: {
      items: SET_PROPS_BATCH_ITEMS_PARAM,
    },
    resultSchema: {
      nodes: 'SparkNode[] — props 已更新的节点数组',
    },
    example: {
      items: [
        { nodeId: 'table', props: { stripe: true }, merge: true },
        { nodeId: 'toolbar', props: { class: 'toolbar-wide' }, merge: true },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 nodeId 未命中现有节点',
        fix: '执行前先用 sparkNodeTree.hasNode 批量确认目标节点存在。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'items 中重复出现同一个 nodeId',
        fix: '同一批次内每个 nodeId 只保留一条更新。',
      },
    ],
  }),
  defineRequestRow({
    action: 'sparkNodeTree.replaceNode',
    target: 'node',
    coreMethod: 'replaceNode',
    description: '用新的 SparkNode 替换目标节点，返回新节点和旧节点。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
      node: NODE_PARAM,
    },
    resultSchema: {
      node: 'SparkNode — 替换后的新节点',
      previous: 'SparkNode — 被替换的旧节点',
    },
    example: {
      nodeId: 'name-column',
      node: { type: 'el-table-column', id: 'name-column', props: { field: 'displayName' } },
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'nodeId 未命中现有节点',
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
    action: 'sparkNodeTree.replaceNodes',
    target: 'node',
    coreMethod: 'replaceNodes',
    description: '批量替换多个节点，适合一次性重建多个字段或容器节点。',
    paramsSchema: {
      items: REPLACE_NODES_ITEMS_PARAM,
    },
    resultSchema: {
      items: 'Array<{ node: SparkNode; previous: SparkNode }> — 每个替换项的新旧节点结果',
    },
    example: {
      items: [
        { nodeId: 'name-column', node: { type: 'el-table-column', id: 'name-column', props: { field: 'displayName' } } },
        { nodeId: 'toolbar', node: { type: 'r-toolbar', id: 'toolbar', props: { dense: true } } },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 nodeId 未命中现有节点',
        fix: '先确认目标节点存在，再执行 replaceNodes。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'items 中重复出现同一个 nodeId',
        fix: '同一批次内同一个节点只保留一次 replace。',
      },
    ],
  }),
  defineRequestRow({
    action: 'sparkNodeTree.removeNode',
    target: 'node',
    coreMethod: 'removeNode',
    description: '删除当前组件实例子树内的指定节点，并返回被删除节点和原始索引。',
    paramsSchema: {
      nodeId: NODE_ID_PARAM,
    },
    resultSchema: {
      removed: 'SparkNode — 被删除的节点',
      index: 'number — 删除前在父节点 children 中的索引',
    },
    example: {
      nodeId: 'toolbar',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, '不能删除根节点。', CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'nodeId 未命中现有节点',
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
    action: 'sparkNodeTree.removeNodes',
    target: 'node',
    coreMethod: 'removeNodes',
    description: '按 nodeIds 批量删除当前组件实例子树内的多个节点，整个批次只提交一次树状态。',
    paramsSchema: {
      nodeIds: NODE_IDS_PARAM,
    },
    resultSchema: {
      items: 'Array<{ removed: SparkNode; index: number }> — 每个删除项的结果',
    },
    example: {
      nodeIds: ['toolbar', 'name-column'],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, '不能删除根节点。', CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 nodeId 未命中现有节点',
        fix: '先确认 nodeIds 全部存在。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'nodeIds 中出现重复 id',
        fix: '去重后再提交删除批次。',
      },
      {
        code: 'CANNOT_REMOVE_ROOT',
        when: 'nodeIds 中包含根节点',
        fix: '只删除根节点的子节点。',
      },
    ],
  }),
  defineRequestRow({
    action: 'sparkNodeTree.reorderChildren',
    target: 'children',
    coreMethod: 'reorderChildren',
    description: '按 childIds 重排当前组件实例或指定子组件的直接结构子节点。',
    paramsSchema: {
      parentId: PARENT_ID_PARAM,
      childIds: CHILD_IDS_PARAM,
    },
    resultSchema: {
      children: 'SparkNodeChildren — 重排后的直接子节点数组',
    },
    example: {
      parentId: null,
      childIds: ['table', 'toolbar'],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, DIRECT_CHILDREN_RULE, INSTANCE_WRITE_RULE, CATALOG_ONLY_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentId 未命中现有节点',
        fix: '先确认父节点存在。',
      },
      {
        code: 'CHILD_NOT_FOUND',
        when: 'childIds 中包含不属于该父节点的 id',
        fix: '先通过 sparkNodeTree.listChildren 确认直接子节点列表。',
      },
      {
        code: 'DUPLICATE_CHILD_ID',
        when: 'childIds 中存在重复项',
        fix: '保证每个直接子节点 id 只出现一次。',
      },
    ],
  }),
] as const satisfies readonly SparkNodeTreeToolParameterRow[]

export const SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE: readonly SparkNodeTreeToolCapabilityRow[] =
  SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map(toCapabilityRow)

export function getSparkNodeTreeToolParameterRow(action: string): SparkNodeTreeToolParameterRow | undefined {
  return SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.find(row => row.action === action)
}

export function getSparkNodeTreeToolCapabilityRow(action: string): SparkNodeTreeToolCapabilityRow | undefined {
  return SPARK_NODE_TREE_TOOL_CAPABILITY_TABLE.find(row => row.action === action)
}
