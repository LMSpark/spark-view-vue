/**
 * 页面设计节点树工具模块。
 *
 * 提供 nodeTree 的完整 CRUD 函数注册表：
 * 读取：getNode / getLocation / hasNode / getParent / listChildren / countNodes / getAllData / collectDataKeys / collectHandlerNames / findByType
 * 写入：addNode / addNodes / moveNode / setProps / setPropsBatch / replaceNode / replaceNodes / removeNode / removeNodes
 *
 * 所有操作作用于 SparkNodeTree/rule.json 模型，通过 componentId（节点顶层 id 字段）定位节点，
 * 绝对禁止将组件类型名（r-table / r-tabs 等）当作 componentId 使用。
 */

import * as SparkAiSchema from '@spark-view/spark-ai/schema'
import type {
  LlmJsonObject,
  LlmJsonValue,
  LlmJsonSchemaObject,
} from '@spark-view/spark-ai/schema'
import {
  ModuleKind,
  type ModuleFunctionMetadata,
  type ModuleInstanceRef,
  type ModuleOperationResult,
  type ModuleParameterPayloadMetadata,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import { PageDesignService } from '../design/page-design-service'
import type {
  PageDesignNodePayloadValidationTarget,
} from '../design/page-design-service'
import type {
  PageDesignNodeTree,
  PageDesignServiceActionBinding,
  PageDesignServiceContext,
} from '../design/page-design-host-api'
import {
  isSparkNode,
  type SparkNode,
  type SparkNodeFindByTypeParams,
  type SparkNodeTreeAddNodesParams,
  type SparkNodeTreeAddParams,
  type SparkNodeTreeChildrenParams,
  type SparkNodeTreeLookupParams,
  type SparkNodeTreeMoveParams,
  type SparkNodeTreeRemoveNodesParams,
  type SparkNodeTreeRemoveParams,
  type SparkNodeTreeReplaceNodesParams,
  type SparkNodeTreeReplaceParams,
  type SparkNodeTreeSetPropsBatchParams,
  type SparkNodeTreeSetPropsParams,
} from '../node-tree'
import { isRecord } from '../json-document'
import { createCurrentPageRef } from './page-design-helpers'
import {
  getPageDesignComponentPayloadGuide,
  isPageDesignWritableComponentPayloadKey,
} from './payload-catalog-tool-catalog'

// ── schema 原语与通用约束 ─────────────────────────────────

const {
  anySchema,
  arraySchema,
  booleanSchema,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} = SparkAiSchema

const NO_PARAMS = noParamsSchema('该 nodeTree 读取函数不接受参数，请传 {} 或留空。')
const EMPTY_EXAMPLE: LlmJsonObject = {}
const COMPONENT_ID_SCHEMA = stringSchema(
  '节点的 id 值（来自 listChildren / getNode 返回结果中的顶层 id 字段）；绝对禁止使用组件类型名（r-table、r-tabs、r-text、r-select 等）作为 componentId，类型名不是 id',
)
const PARENT_COMPONENT_ID_SCHEMA: LlmJsonSchemaObject = {
  type: ['string', 'null'],
  description: '父节点的 id 值（同 COMPONENT_ID_PARAM 规则）；null/省略表示当前绑定组件实例',
}
const INDEX_SCHEMA = numberSchema('插入位置；省略时追加到末尾')
const PROPS_SCHEMA = objectSchema({}, {
  additionalProperties: true,
  description: '要写入的 props 对象',
})
const COMPONENT_IDS_SCHEMA = arraySchema(stringSchema('目标组件 id'), '目标组件 id 列表')
const NODE_PARAM = objectSchema({
  type: stringSchema('组件类型'),
  id: stringSchema('节点顶层 id；AI 写入时必填，必须是稳定业务语义 id，后续 componentId 必须使用这个值'),
  props: objectSchema({}, { additionalProperties: true, description: '节点属性' }),
  children: arraySchema(anySchema(), 'SparkNodeChildren；子节点数组，可混合 SparkNode / string / number'),
}, {
  required: ['type', 'id'],
  description: 'node 必须是完整 SparkNode 对象，不要只传类型名字符串；AI 新增/替换的每个结构节点都必须带顶层 id。',
})
const NODES_SCHEMA = arraySchema(NODE_PARAM, '按顺序插入的多个节点')
const SET_PROPS_BATCH_ITEM_SCHEMA = objectSchema({
  componentId: COMPONENT_ID_SCHEMA,
  props: PROPS_SCHEMA,
  merge: booleanSchema('true=合并，false=替换；省略时默认合并'),
}, {
  required: ['componentId', 'props'],
  description: '每个批处理项都必须显式提供 componentId；nodeId 参数无效。',
})
const SET_PROPS_BATCH_ITEMS_SCHEMA = arraySchema(SET_PROPS_BATCH_ITEM_SCHEMA)
const REPLACE_NODES_ITEM_SCHEMA = objectSchema({
  componentId: COMPONENT_ID_SCHEMA,
  node: NODE_PARAM,
}, {
  required: ['componentId', 'node'],
  description: '每个替换项都必须显式提供 componentId；nodeId 参数无效。',
})
const REPLACE_NODES_ITEMS_SCHEMA = arraySchema(REPLACE_NODES_ITEM_SCHEMA)

const RUNTIME_WIRED_RULE = '该动作直接作用于当前 PageDesignEditHost.getNodeTree() 返回的 SparkNodeTree/rule.json 模型。'
const INSTANCE_RULE = '需先通过 new SparkNodeTree({ root }) 绑定一个当前组件实例（SparkNode）；该实例既可以是页面组件，也可以是任意子组件，后续动作都作用于它的当前子树状态。'
const NAMED_PARAM_RULE = '运行时应优先使用命名参数对象，而不是位置参数。'
const DIRECT_CHILDREN_RULE = 'children 相关动作只作用于直接子节点，不递归跨层修改。'
const SCALAR_PARENT_COMPONENT_RULE = 'parentComponentId 仅接受 string 或 null 原子值，禁止对象嵌套（例如 { componentId: "root-table" }）。'
const INSTANCE_WRITE_RULE = 'SparkNodeTree 的写操作会更新当前组件实例对应的 root；如需最新子树快照，请读取 tree.root 或 toJSON()。'
const PAYLOAD_GUIDE_RULE = 'LLM 写目录组件前应先显式调用 payload-catalog.guidePayload；node-tree 写动作仍会按 SparkNode.type 自动提取指南并校验 node.props，若返回 PAYLOAD_GUIDE_NOT_FOUND / NODE_PAYLOAD_SCHEMA_INVALID，必须把参数校验结果读完后修正重试。'
const MERGE_FALSE_REPLACE_RULE = 'merge=false 会整体替换目标节点 props；除非你已把原有 dataViewKey/contextDataMember/field/options 等关键绑定完整带回，否则必须使用 merge=true 或省略 merge。'
const EMPTY_CONTAINER_TYPES = new Set(['div', 'r-section', 'r-card', 'r-form', 'r-detail'])
// PAGE_DESIGN_REFACTOR_SOURCE[node-type-allowlist]: rule.json 写入允许 catalog 内组件和渲染器 native HTML；目录外未知业务 type 在进入 fallback 前拦截。
const NATIVE_HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'button',
  'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1',
  'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label',
  'legend', 'li', 'main', 'mark', 'menu', 'meter', 'nav', 'ol', 'optgroup', 'option', 'output', 'p',
  'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'select', 'small',
  'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot',
  'th', 'thead', 'time', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
])

// ── node-tree 动作声明 ────────────────────────────────────

const NODE_TREE_ACTIONS: readonly ModuleFunctionMetadata[] = [
  {
    name: 'getNode',
    description: '按 componentId 查找节点；未命中时返回 null。',
    paramsSchema: paramsSchema({ componentId: COMPONENT_ID_SCHEMA }, ['componentId']),
    resultSchema: {
      node: 'SparkNode | null — 命中的节点',
    },
    example: {
      componentId: 'table',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'getLocation',
    description: '查找节点并返回其父节点、层级深度和直接索引位置。',
    paramsSchema: paramsSchema({ componentId: COMPONENT_ID_SCHEMA }, ['componentId']),
    resultSchema: {
      location: 'SparkNodeLocation | null — 命中的位置信息',
    },
    example: {
      componentId: 'name-column',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'hasNode',
    description: '判断指定 componentId 是否存在于当前树中。',
    paramsSchema: paramsSchema({ componentId: COMPONENT_ID_SCHEMA }, ['componentId']),
    resultSchema: {
      exists: 'boolean — 是否存在',
    },
    example: {
      componentId: 'toolbar',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'getParent',
    description: '获取指定节点的直接父节点；当前绑定 root 或未命中时返回 null。',
    paramsSchema: paramsSchema({ componentId: COMPONENT_ID_SCHEMA }, ['componentId']),
    resultSchema: {
      parent: 'SparkNode | null — 直接父节点',
    },
    example: {
      componentId: 'name-column',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'listChildren',
    description: '读取当前组件实例或指定子组件的直接 children 数组。',
    paramsSchema: paramsSchema(
      { parentComponentId: PARENT_COMPONENT_ID_SCHEMA },
      [],
      'parentComponentId 必须是 string/null 原子值；省略时默认当前绑定组件实例。',
    ),
    resultSchema: {
      children: 'SparkNodeChildren — 直接子节点数组',
    },
    example: {
      parentComponentId: null,
    },
    usageRules: [INSTANCE_RULE, DIRECT_CHILDREN_RULE, SCALAR_PARENT_COMPONENT_RULE, NAMED_PARAM_RULE, RUNTIME_WIRED_RULE],
    failureModes: [
      {
        code: 'PARENT_NOT_FOUND',
        when: 'parentComponentId 未命中现有节点',
        fix: '先通过 nodeTree.getNode 或 nodeTree.hasNode 确认父节点存在。',
      },
    ],
  },
  {
    name: 'countNodes',
    description: '统计当前组件实例子树中的结构节点数量，不包含字符串/数字字面量子节点。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      count: 'number — 结构节点总数',
    },
    example: EMPTY_EXAMPLE,
    usageRules: [INSTANCE_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'getAllData',
    description: '获取当前绑定组件实例完整子树的全部数据快照（包含递归 children）。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      root: 'SparkNode — 当前绑定组件实例完整子树快照（等价 toJSON 返回值）',
    },
    example: EMPTY_EXAMPLE,
    usageRules: [INSTANCE_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'collectDataKeys',
    description: '收集当前组件实例子树中出现过的全部唯一 dataViewKey / optionDataViewKey，用于确认页面现有数据绑定。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataViewKeys: 'Set<string> — 唯一 DataView 定位键集合（包含 dataViewKey / optionDataViewKey）',
    },
    example: EMPTY_EXAMPLE,
    usageRules: [INSTANCE_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'collectHandlerNames',
    description: '收集当前组件实例子树 props.on 中出现的全部唯一处理器名。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      handlers: 'Set<string> — 唯一处理器名集合',
    },
    example: EMPTY_EXAMPLE,
    usageRules: [INSTANCE_RULE, RUNTIME_WIRED_RULE],
    failureModes: [],
  },
  {
    name: 'findByType',
    description:
      '按组件类型名递归搜索子树，返回所有匹配节点的真实 id、深度和父节点 id。' +
      '当知道目标组件的 type（如 r-tabs、r-form）但不知道其节点 id 时，用本动作代替多步 listChildren→getNode，' +
      '一次拿到可直接用于 setProps / removeNode 的真实 componentId。',
    paramsSchema: paramsSchema({
      type: stringSchema('组件类型名（如 r-tabs、r-form、r-table），精确匹配'),
      startComponentId: stringSchema('从哪个节点开始向下搜索（必须是真实节点 id，不能是类型名）；省略时从根节点开始'),
      limit: numberSchema('最多返回多少条匹配，省略时不限制'),
    }, ['type']),
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
      RUNTIME_WIRED_RULE,
      '返回的 matches[n].id 即为真实 componentId，可直接传给 getNode / setProps / removeNode；' +
        '仅当 id 为 undefined 时表示该节点未设置 id，需改用 index 定位。',
    ],
    failureModes: [
      {
        code: 'START_NOT_FOUND',
        when: 'startComponentId 未命中现有节点',
        fix: '先通过 nodeTree.hasNode 确认 startComponentId 存在，或省略 startComponentId 从根节点开始搜索。',
      },
    ],
  },
  {
    name: 'addNode',
    description: '向指定层级插入一个新节点。入参 node 必须是完整合法的 SparkNode 实例；工具会按 node 及其子树中每个组件 type 自动提取 payload 指南并校验 props。',
    paramsSchema: paramsSchema({
      node: NODE_PARAM,
      parentComponentId: PARENT_COMPONENT_ID_SCHEMA,
      index: INDEX_SCHEMA,
    }, ['node'], 'node 为必填；parentComponentId 必须是 string/null 原子值。'),
    resultSchema: {
      node: 'SparkNode — 新插入的节点',
      index: 'number — 实际插入位置',
    },
    example: {
      parentComponentId: 'toolbar',
      node: { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
    },
    usageRules: [INSTANCE_RULE, SCALAR_PARENT_COMPONENT_RULE, NAMED_PARAM_RULE, PAYLOAD_GUIDE_RULE, INSTANCE_WRITE_RULE, RUNTIME_WIRED_RULE],
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
  },
  {
    name: 'addNodes',
    description: '向同一个子组件容器批量插入多个新节点。入参 nodes 必须是合法 SparkNode 数组；简单页面优先用本动作一次写入 r-section/r-form/字段/r-table 等常用组件。',
    paramsSchema: paramsSchema({
      nodes: NODES_SCHEMA,
      parentComponentId: PARENT_COMPONENT_ID_SCHEMA,
      index: INDEX_SCHEMA,
    }, ['nodes'], 'nodes 为必填；parentComponentId 必须是 string/null 原子值。'),
    resultSchema: {
      nodes: 'SparkNode[] — 按顺序成功插入的节点',
      indexes: 'number[] — 每个节点的实际插入位置',
    },
    example: {
      parentComponentId: 'toolbar',
      nodes: [
        { type: 'r-button', id: 'refresh-action', props: { action: 'refresh' } },
        { type: 'r-button', id: 'export-action', props: { action: 'export' } },
      ],
    },
    usageRules: [INSTANCE_RULE, SCALAR_PARENT_COMPONENT_RULE, NAMED_PARAM_RULE, PAYLOAD_GUIDE_RULE, INSTANCE_WRITE_RULE, RUNTIME_WIRED_RULE],
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
  },
  {
    name: 'moveNode',
    description: '把已有节点移动到新的父节点或兄弟位置。用于调整布局顺序或容器归属，避免 removeNode + addNode 重建已有子树造成大块文本输出。',
    paramsSchema: paramsSchema({
      componentId: COMPONENT_ID_SCHEMA,
      parentComponentId: PARENT_COMPONENT_ID_SCHEMA,
      index: INDEX_SCHEMA,
    }, ['componentId'], 'componentId 是要移动的现有节点；parentComponentId 是目标父节点，省略/null 表示当前绑定组件实例；index 是目标父节点 children 中的最终插入位置。'),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'componentId 未命中现有节点',
        fix: '先通过 nodeTree.getNode 或 nodeTree.findByType 获取真实 componentId。',
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
  },
  {
    name: 'setProps',
    description: '写入或替换目标节点的 props。',
    paramsSchema: paramsSchema({
      componentId: COMPONENT_ID_SCHEMA,
      props: PROPS_SCHEMA,
      merge: booleanSchema('true=合并，false=替换；省略时默认合并'),
    }, ['componentId', 'props']),
    resultSchema: {
      node: 'SparkNode — props 已更新的节点',
    },
    example: {
      componentId: 'table',
      props: { stripe: true },
      merge: true,
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, PAYLOAD_GUIDE_RULE, MERGE_FALSE_REPLACE_RULE, INSTANCE_WRITE_RULE, RUNTIME_WIRED_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: 'componentId 未命中现有节点',
        fix: '先通过 nodeTree.getNode 或 nodeTree.hasNode 确认目标节点存在。',
      },
    ],
  },
  {
    name: 'setPropsBatch',
    description: '批量写入多个节点的 props，整个批次只提交一次树状态。',
    paramsSchema: paramsSchema({ items: SET_PROPS_BATCH_ITEMS_SCHEMA }, ['items']),
    resultSchema: {
      nodes: 'SparkNode[] — props 已更新的节点数组',
    },
    example: {
      items: [
        { componentId: 'table', props: { stripe: true }, merge: true },
        { componentId: 'toolbar', props: { class: 'toolbar-wide' }, merge: true },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, PAYLOAD_GUIDE_RULE, MERGE_FALSE_REPLACE_RULE, INSTANCE_WRITE_RULE, RUNTIME_WIRED_RULE],
    failureModes: [
      {
        code: 'NODE_NOT_FOUND',
        when: '某个 componentId 未命中现有节点',
        fix: '执行前先用 nodeTree.hasNode 批量确认目标节点存在。',
      },
      {
        code: 'DUPLICATE_NODE_ID',
        when: 'items 中重复出现同一个 componentId',
        fix: '同一批次内每个 componentId 只保留一条更新。',
      },
    ],
  },
  {
    name: 'replaceNode',
    description: '用新的 SparkNode 替换目标节点。警告：新的 node 必须使用合法 type 并携带稳定 id；工具会自动提取 payload 指南并校验 props，避免配置污染。返回新节点和被替换的旧节点。',
    paramsSchema: paramsSchema({ componentId: COMPONENT_ID_SCHEMA, node: NODE_PARAM }, ['componentId', 'node']),
    resultSchema: {
      node: 'SparkNode — 替换后的新节点',
      previous: 'SparkNode — 被替换的旧节点',
    },
    example: {
      componentId: 'name-column',
      node: { type: 'r-column-group', id: 'name-column', props: { field: 'displayName' } },
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, PAYLOAD_GUIDE_RULE, INSTANCE_WRITE_RULE, RUNTIME_WIRED_RULE],
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
  },
  {
    name: 'replaceNodes',
    description: '批量替换多个节点，适合一次性重建多个字段或容器节点。',
    paramsSchema: paramsSchema({ items: REPLACE_NODES_ITEMS_SCHEMA }, ['items']),
    resultSchema: {
      items: 'Array<{ node: SparkNode; previous: SparkNode }> — 每个替换项的新旧节点结果',
    },
    example: {
      items: [
        { componentId: 'name-column', node: { type: 'r-column-group', id: 'name-column', props: { field: 'displayName' } } },
        { componentId: 'toolbar', node: { type: 'r-toolbar', id: 'toolbar', props: { dense: true } } },
      ],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, PAYLOAD_GUIDE_RULE, INSTANCE_WRITE_RULE, RUNTIME_WIRED_RULE],
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
  },
  {
    name: 'removeNode',
    description: '删除当前组件实例子树内的指定节点，并返回被删除节点和原始索引。',
    paramsSchema: paramsSchema({ componentId: COMPONENT_ID_SCHEMA }, ['componentId']),
    resultSchema: {
      removed: 'SparkNode — 被删除的节点',
      index: 'number — 删除前在父节点 children 中的索引',
    },
    example: {
      componentId: 'toolbar',
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, '不能删除根节点。', RUNTIME_WIRED_RULE],
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
  },
  {
    name: 'removeNodes',
    description: '按 componentIds 批量删除当前组件实例子树内的多个节点，整个批次只提交一次树状态。',
    paramsSchema: paramsSchema({ componentIds: COMPONENT_IDS_SCHEMA }, ['componentIds']),
    resultSchema: {
      items: 'Array<{ removed: SparkNode; index: number }> — 每个删除项的结果',
    },
    example: {
      componentIds: ['toolbar', 'name-column'],
    },
    usageRules: [INSTANCE_RULE, NAMED_PARAM_RULE, INSTANCE_WRITE_RULE, '不能删除根节点。', RUNTIME_WIRED_RULE],
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
  },
]

// ── SparkNodeTree action 绑定 ─────────────────────────────

type NodeTreeActionBinding = PageDesignServiceActionBinding<PageDesignNodeTree>

const NODE_TREE_ACTION_BINDINGS: Readonly<Record<string, NodeTreeActionBinding>> = {
  getNode: nodeTreeAction('getNode', false, (tree, args) => tree.getNode(readLookupParams(args, 'getNode'))),
  getLocation: nodeTreeAction('getLocation', false, (tree, args) => tree.getLocation(readLookupParams(args, 'getLocation'))),
  hasNode: nodeTreeAction('hasNode', false, (tree, args) => tree.hasNode(readLookupParams(args, 'hasNode'))),
  getParent: nodeTreeAction('getParent', false, (tree, args) => tree.getParent(readLookupParams(args, 'getParent'))),
  listChildren: nodeTreeAction('listChildren', false, (tree, args) => tree.listChildren(readChildrenParams(args))),
  countNodes: nodeTreeAction('countNodes', false, (tree) => tree.countNodes()),
  getAllData: nodeTreeAction('getAllData', false, (tree) => tree.getAllData()),
  collectDataKeys: nodeTreeAction('collectDataKeys', false, (tree) => tree.collectDataViewKeys()),
  collectHandlerNames: nodeTreeAction('collectHandlerNames', false, (tree) => tree.collectHandlerNames()),
  findByType: nodeTreeAction('findByType', false, (tree, args) => tree.findByType(readFindByTypeParams(args))),
  addNode: nodeTreeAction('addNode', true, (tree, args) => tree.addNode(readAddParams(args))),
  addNodes: nodeTreeAction('addNodes', true, (tree, args) => tree.addNodes(readAddNodesParams(args))),
  moveNode: nodeTreeAction('moveNode', true, (tree, args) => tree.moveNode(readMoveParams(args))),
  setProps: nodeTreeAction('setProps', true, (tree, args) => tree.setProps(readSetPropsParams(args))),
  setPropsBatch: nodeTreeAction('setPropsBatch', true, (tree, args) => tree.setPropsBatch(readSetPropsBatchParams(args))),
  replaceNode: nodeTreeAction('replaceNode', true, (tree, args) => tree.replaceNode(readReplaceParams(args))),
  replaceNodes: nodeTreeAction('replaceNodes', true, (tree, args) => tree.replaceNodes(readReplaceNodesParams(args))),
  removeNode: nodeTreeAction('removeNode', true, (tree, args) => tree.removeNode(readRemoveParams(args))),
  removeNodes: nodeTreeAction('removeNodes', true, (tree, args) => tree.removeNodes(readRemoveNodesParams(args))),
}

// PAGE_DESIGN_AI_TRACE[page-design-node-tree-tool]: pageDesign AI 修改 rule.json 的 ModuleKind 出处；组件 type、id、payload props 校验也集中在这条 AI 写入边界。
// PAGE_DESIGN_REFACTOR_SOURCE[node-tree-write-gate]: rule.json AI 写入、组件类型拦截、guide 要求和 props 错误回传都集中在这里，smoke 不应重复实现。
/**
 * pageDesign 节点树子模块。
 *
 * 所有 rule.json 结构写入都先经过本 ModuleKind：稳定 id、组件 type 白名单、
 * 数据优先、payload guide、props schema 和 DataView 上下文约束在这里统一失败回传给 LLM。
 */
export class PageDesignNodeTreeModuleKind extends ModuleKind {
  private readonly service: PageDesignService
  private readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext

  public constructor(options: {
    readonly service: PageDesignService
    readonly contextFactory: (ctx: ModulePathContext) => PageDesignServiceContext
    readonly parentKind?: string
    readonly payloads?: readonly ModuleParameterPayloadMetadata[]
  }) {
    super({
      kind: 'node-tree',
      name: 'Page Design Node Tree',
      description: '当前页面 SparkNodeTree/rule.json 结构读写;通过标准 function calling 调用 19 个公开方法。',
      attributes: [],
      functions: NODE_TREE_ACTIONS,
      ...(options.payloads === undefined ? {} : { payloads: options.payloads }),
      ...(options.parentKind === undefined ? {} : { parentKind: options.parentKind }),
      children: [],
    })
    this.service = options.service
    this.contextFactory = options.contextFactory
  }

  protected override async runFunction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const binding = NODE_TREE_ACTION_BINDINGS[actionName]
    if (binding === undefined) {
      throw new Error(`node-tree action runner is not registered: ${actionName}`)
    }
    const context = this.contextFactory(ctx)
    const nodeIdError = validateWrittenNodeIds(actionName, args)
    if (nodeIdError !== null) {
      return this.serviceResultToOperationResult(nodeIdError)
    }
    const nodeTypeError = validateWritableNodeTypes(actionName, args)
    if (nodeTypeError !== null) {
      return this.serviceResultToOperationResult(nodeTypeError)
    }
    const setPropsTypeError = await this.validateSetPropsWritableTargets(context, actionName, args)
    if (setPropsTypeError !== null) {
      return this.serviceResultToOperationResult(setPropsTypeError)
    }
    const dataFirstError = this.validateDataFirst(context, actionName, args)
    if (dataFirstError !== null) {
      return this.serviceResultToOperationResult(dataFirstError)
    }
    const emptyContainerError = validateCompleteContainerWrite(actionName, args)
    if (emptyContainerError !== null) {
      return this.serviceResultToOperationResult(emptyContainerError)
    }
    const payloadTargets = await this.collectPayloadTargetsForAction(context, actionName, args)
    const payloadGuideError = this.ensurePayloadGuides(context, payloadTargets, actionName)
    if (payloadGuideError !== null) {
      return this.serviceResultToOperationResult(payloadGuideError)
    }
    const payloadPropsError = this.service.validateNodePayloadProps(
      context,
      payloadTargets,
      actionName,
    )
    if (payloadPropsError !== null) {
      return this.serviceResultToOperationResult(payloadPropsError)
    }
    const requiredDataBindingsError = validateRequiredDataBindings(actionName, args)
    if (requiredDataBindingsError !== null) {
      return this.serviceResultToOperationResult(requiredDataBindingsError)
    }
    return this.serviceResultToOperationResult(
      await this.service.runNodeTreeAction(
        context,
        args,
        binding,
      ),
    )
  }

  protected override createCurrentInstanceRef(ctx: ModulePathContext): ModuleInstanceRef | null {
    return createCurrentPageRef(ctx, '当前页面节点树')
  }

  private ensurePayloadGuides(
    context: PageDesignServiceContext,
    targets: readonly PageDesignNodePayloadValidationTarget[],
    actionName: string,
  ) {
    const missing: string[] = []
    for (const type of [...new Set(targets.map((target) => target.type))].sort()) {
      const guide = getPageDesignComponentPayloadGuide(type)
      if (guide === null) {
        missing.push(type)
        continue
      }
      this.service.recordNodePayloadGuide(context, type, guide)
    }
    if (missing.length === 0) return null
    return PageDesignService.failure(
      'PAYLOAD_GUIDE_NOT_FOUND',
      `node-tree.${actionName} 无法根据组件 type 提取参数荷载指南: ${missing.join(', ')}`,
      '先通过 payload-catalog.queryPayloads 选择存在于组件荷载目录的组件；不要向 rule.json 写入目录外组件或 SparkComponentRenderer 会落 fallback 的未知业务类型。',
    )
  }

  private async collectPayloadTargetsForAction(
    context: PageDesignServiceContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<readonly PageDesignNodePayloadValidationTarget[]> {
    const writtenTargets = componentPayloadTargetsWrittenByAction(actionName, args)
    if (writtenTargets.length > 0) return writtenTargets
    if (actionName === 'setProps') {
      const target = await this.collectSetPropsPayloadTarget(context, args, 'setProps')
      return target === null ? [] : [target]
    }
    if (actionName !== 'setPropsBatch' || !Array.isArray(args['items'])) return []
    const targets: PageDesignNodePayloadValidationTarget[] = []
    for (const [index, item] of args['items'].entries()) {
      if (!isRecord(item)) continue
      const target = await this.collectSetPropsPayloadTarget(context, item, `setPropsBatch.items[${index}]`)
      if (target !== null) targets.push(target)
    }
    return targets
  }

  private async collectSetPropsPayloadTarget(
    context: PageDesignServiceContext,
    args: Readonly<Record<string, unknown>>,
    path: string,
  ): Promise<PageDesignNodePayloadValidationTarget | null> {
    const componentId = typeof args['componentId'] === 'string' ? args['componentId'].trim() : ''
    const props = args['props']
    if (componentId.length === 0 || !isRecord(props)) return null
    const getNodeBinding = NODE_TREE_ACTION_BINDINGS['getNode']
    if (getNodeBinding === undefined) return null
    const nodeResult = await this.service.runNodeTreeAction(
      context,
      { componentId },
      getNodeBinding,
    )
    if (!nodeResult.ok || !isRecord(nodeResult.data)) return null
    const type = typeof nodeResult.data['type'] === 'string' ? nodeResult.data['type'].trim() : ''
    if (!isPageDesignWritableComponentPayloadKey(type)) return null
    return {
      type,
      id: typeof nodeResult.data['id'] === 'string' ? nodeResult.data['id'].trim() : componentId,
      path,
      props,
    }
  }

  private validateDataFirst(
    context: PageDesignServiceContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ) {
    if (!isNodeWriteAction(actionName)) return null
    const componentTypes = componentTypesWrittenByAction(actionName, args)
    if (!componentTypes.some(isPageDesignWritableComponentPayloadKey)) return null
    if (this.service.hasDataTables(context)) return null
    return PageDesignService.failure(
      'DATASET_FIRST_REQUIRED',
      `node-tree.${actionName} 不能在 pagedata.json 尚无业务表时写页面组件`,
      '先通过 dataset.createTable 建立主业务表和字典/选项表；随后再用 node-tree.addNodes 一次写入带稳定 id 的完整表单、统计和列表节点。',
    )
  }

  private async validateSetPropsWritableTargets(
    context: PageDesignServiceContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ) {
    if (actionName !== 'setProps' && actionName !== 'setPropsBatch') return null
    const targets = await this.collectSetPropsNodeTypes(context, actionName, args)
    const blocked = targets
      .filter((target) => target.type.length > 0 && !isPageDesignAllowedNodeType(target.type))
      .map((target) => `${target.path}<${target.type}${target.id.length > 0 ? `#${target.id}` : ''}>`)
    if (blocked.length === 0) return null
    return PageDesignService.failure(
      'UNKNOWN_NODE_TYPE',
      `node-tree.${actionName} 目标组件 type 为空或无法执行 props 写入: ${blocked.join(', ')}`,
      '只能修改 payload-catalog 可查询到的业务组件或标准 HTML 节点；目录外未知业务组件会进入渲染 fallback，必须替换为目录组件或标准 HTML。',
    )
  }

  private async collectSetPropsNodeTypes(
    context: PageDesignServiceContext,
    actionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<ReadonlyArray<{ readonly type: string; readonly id: string; readonly path: string }>> {
    const rawItems = args['items']
    const items: readonly unknown[] = Array.isArray(rawItems)
      ? rawItems.map((item: unknown) => item)
      : []
    const inputs = actionName === 'setProps'
      ? [{ value: args, path: 'setProps' }]
      : items.map((item, index) => ({ value: item, path: `setPropsBatch.items[${index}]` }))
    const getNodeBinding = NODE_TREE_ACTION_BINDINGS['getNode']
    if (getNodeBinding === undefined) return []
    const out: Array<{ readonly type: string; readonly id: string; readonly path: string }> = []
    for (const input of inputs) {
      if (!isRecord(input.value)) continue
      const componentId = typeof input.value['componentId'] === 'string' ? input.value['componentId'].trim() : ''
      if (componentId.length === 0) continue
      const nodeResult = await this.service.runNodeTreeAction(context, { componentId }, getNodeBinding)
      if (!nodeResult.ok || !isRecord(nodeResult.data)) continue
      const type = typeof nodeResult.data['type'] === 'string' ? nodeResult.data['type'].trim() : ''
      out.push({
        type,
        id: typeof nodeResult.data['id'] === 'string' ? nodeResult.data['id'].trim() : componentId,
        path: input.path,
      })
    }
    return out
  }
}

// ── 写入前校验流水线 ──────────────────────────────────────

function nodeTreeAction(
  serviceLabel: string,
  mutates: boolean,
  run: NodeTreeActionBinding['run'],
): NodeTreeActionBinding {
  return {
    serviceLabel,
    mutates,
    run,
  }
}

function isNodeWriteAction(actionName: string): boolean {
  return actionName === 'addNode'
    || actionName === 'addNodes'
    || actionName === 'replaceNode'
    || actionName === 'replaceNodes'
}

function validateWrittenNodeIds(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  if (!isNodeWriteAction(actionName)) return null
  const missing = collectWrittenNodeIdIssues(actionName, args)
  if (missing.length === 0) return null
  return PageDesignService.failure(
    'NODE_ID_REQUIRED',
    `node-tree.${actionName} 写入的 SparkNode 缺少顶层 id: ${missing.join(', ')}`,
    '每个新增或替换的结构节点都必须带稳定业务语义 id，例如 business-form-section、primary-form、field-start-date、result-list；后续 componentId 必须使用这些真实 id。',
  )
}

function validateWritableNodeTypes(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  if (!isNodeWriteAction(actionName)) return null
  const unknown = collectUnknownNodeTypes(actionName, args)
  if (unknown.length === 0) return null
  return PageDesignService.failure(
    'UNKNOWN_NODE_TYPE',
    `node-tree.${actionName} 写入了未知组件 type: ${unknown.join(', ')}`,
    '组件 type 必须是 payload-catalog 中存在的组件，或 SparkComponentRenderer native 分支允许的标准 HTML 标签；目录外未知业务组件禁止写入。',
  )
}

function validateCompleteContainerWrite(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  if (actionName !== 'addNode' && actionName !== 'addNodes') return null
  const roots = writtenRootNodes(actionName, args)
  if (roots.length === 0) return null
  if (!roots.every(isEmptyContainerShell)) return null
  return PageDesignService.failure(
    'INCOMPLETE_NODE_TREE_WRITE',
    `node-tree.${actionName} 只写入了空容器，未形成可验收页面结构`,
    '不要只添加空 r-section/r-form 容器；在同一次 addNodes 中写入具备数据绑定、字段、动作或列表/详情区域的完整子树，具体结构以 lifecycle 返回的任务知识为准。',
  )
}

function validateRequiredDataBindings(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) {
  if (!isNodeWriteAction(actionName)) return null
  const issues: string[] = []
  for (const [index, node] of writtenRootNodes(actionName, args).entries()) {
    collectRequiredDataBindingIssues(node, `${actionName}.node[${index}]`, issues)
  }
  if (issues.length === 0) return null
  return PageDesignService.failure(
    'CONTEXT_DATA_MEMBER_REQUIRED',
    `node-tree.${actionName} 表单/详情上下文绑定缺少 contextDataMember: ${issues.join(', ')}`,
    'r-form/r-detail 使用 dataViewKey 绑定 DataView 时，必须在 props 中显式写 contextDataMember: "currentRow"；不要只写 dataMember。',
  )
}

// ── 写入参数结构提取 ──────────────────────────────────────

function componentTypesWrittenByAction(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): readonly string[] {
  switch (actionName) {
    case 'addNode':
      return collectGuidedComponentTypes(args['node'])
    case 'addNodes':
      return collectGuidedComponentTypes(args['nodes'])
    case 'replaceNode':
      return collectGuidedComponentTypes(args['node'])
    case 'replaceNodes':
      return collectGuidedComponentTypes(args['items'])
    default:
      return []
  }
}

function componentPayloadTargetsWrittenByAction(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): readonly PageDesignNodePayloadValidationTarget[] {
  return writtenRootNodes(actionName, args).flatMap((node, index) =>
    collectNodePayloadTargets(node, `${actionName}.node[${index}]`),
  )
}

function writtenRootNodes(actionName: string, args: Readonly<Record<string, LlmJsonValue>>): ReadonlyArray<Record<string, unknown>> {
  switch (actionName) {
    case 'addNode':
    case 'replaceNode':
      return isRecord(args['node']) ? [args['node']] : []
    case 'addNodes':
      return Array.isArray(args['nodes']) ? args['nodes'].filter(isRecord) : []
    case 'replaceNodes':
      return Array.isArray(args['items'])
        ? args['items'].flatMap((item) => isRecord(item) && isRecord(item['node']) ? [item['node']] : [])
        : []
    default:
      return []
  }
}

function collectNodePayloadTargets(node: Record<string, unknown>, path: string): PageDesignNodePayloadValidationTarget[] {
  const type = typeof node['type'] === 'string' ? node['type'].trim() : ''
  const out: PageDesignNodePayloadValidationTarget[] = []
  if (type.length > 0 && isPageDesignWritableComponentPayloadKey(type)) {
    out.push({
      type,
      id: typeof node['id'] === 'string' ? node['id'].trim() : '',
      path,
      props: isRecord(node['props']) ? node['props'] : {},
    })
  }
  const children = node['children']
  if (!Array.isArray(children)) return out
  children.forEach((child, index) => {
    if (isRecord(child)) out.push(...collectNodePayloadTargets(child, `${path}.children[${index}]`))
  })
  return out
}

function collectUnknownNodeTypes(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): string[] {
  const out = new Set<string>()
  for (const [index, node] of writtenRootNodes(actionName, args).entries()) {
    collectUnknownNodeTypesInto(node, `${actionName}.node[${index}]`, out)
  }
  return [...out].sort()
}

function collectUnknownNodeTypesInto(node: Record<string, unknown>, path: string, out: Set<string>): void {
  const type = typeof node['type'] === 'string' ? node['type'].trim() : ''
  if (type.length > 0 && !isPageDesignAllowedNodeType(type)) {
    const id = typeof node['id'] === 'string' && node['id'].trim().length > 0 ? `#${node['id'].trim()}` : ''
    out.add(`${path}<${type}${id}>`)
  }
  const children = node['children']
  if (!Array.isArray(children)) return
  children.forEach((child, index) => {
    if (isRecord(child)) collectUnknownNodeTypesInto(child, `${path}.children[${index}]`, out)
  })
}

function collectWrittenNodeIdIssues(
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
): string[] {
  const issues: string[] = []
  for (const [index, node] of writtenRootNodes(actionName, args).entries()) {
    collectMissingNodeIds(node, `${actionName}.node[${index}]`, issues)
  }
  return issues
}

function collectMissingNodeIds(node: Record<string, unknown>, path: string, issues: string[]): void {
  const type = typeof node['type'] === 'string' ? node['type'].trim() : ''
  if (type.length > 0 && (typeof node['id'] !== 'string' || node['id'].trim().length === 0)) {
    issues.push(`${path}<${type}>`)
  }
  const children = node['children']
  if (!Array.isArray(children)) return
  children.forEach((child, index) => {
    if (isRecord(child)) collectMissingNodeIds(child, `${path}.children[${index}]`, issues)
  })
}

function collectRequiredDataBindingIssues(node: Record<string, unknown>, path: string, issues: string[]): void {
  const type = typeof node['type'] === 'string' ? node['type'].trim() : ''
  const id = typeof node['id'] === 'string' ? node['id'].trim() : ''
  const props = isRecord(node['props']) ? node['props'] : {}
  const dataViewKey = typeof props['dataViewKey'] === 'string' ? props['dataViewKey'].trim() : ''
  const contextDataMember = typeof props['contextDataMember'] === 'string' ? props['contextDataMember'].trim() : ''
  if ((type === 'r-form' || type === 'r-detail') && dataViewKey.length > 0 && contextDataMember.length === 0) {
    issues.push(`${path}<${type}${id.length > 0 ? `#${id}` : ''}>`)
  }
  const children = node['children']
  if (!Array.isArray(children)) return
  children.forEach((child, index) => {
    if (isRecord(child)) collectRequiredDataBindingIssues(child, `${path}.children[${index}]`, issues)
  })
}

function isEmptyContainerShell(node: Record<string, unknown>): boolean {
  const type = typeof node['type'] === 'string' ? node['type'].trim() : ''
  if (!EMPTY_CONTAINER_TYPES.has(type)) return false
  const children = node['children']
  if (Array.isArray(children) && children.length > 0) return false
  const props = isRecord(node['props']) ? node['props'] : {}
  return !hasMeaningfulBindingOrAction(props)
}

function hasMeaningfulBindingOrAction(props: Record<string, unknown>): boolean {
  return [
    'dataViewKey',
    'optionDataViewKey',
    'dataMember',
    'field',
    'action',
    'toolbar',
    'actions',
  ].some((key) => props[key] !== undefined)
}

function collectGuidedComponentTypes(value: unknown): string[] {
  const out = new Set<string>()
  const seen = new WeakSet<object>()
  collectGuidedComponentTypesInto(value, out, seen)
  return [...out].sort()
}

function collectGuidedComponentTypesInto(value: unknown, out: Set<string>, seen: WeakSet<object>): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) collectGuidedComponentTypesInto(item, out, seen)
    return
  }
  if (!isRecord(value)) return
  if (isPayloadGuideCandidate(value)) {
    out.add(value['type'])
  }
  for (const child of Object.values(value)) {
    collectGuidedComponentTypesInto(child, out, seen)
  }
}

function isPayloadGuideCandidate(value: Record<string, unknown>): value is Record<string, unknown> & { type: string } {
  if (typeof value['type'] !== 'string') return false
  const type = value['type'].trim()
  if (type.length === 0) return false
  return isPageDesignWritableComponentPayloadKey(type)
}

function isPageDesignAllowedNodeType(type: string): boolean {
  const normalized = type.trim()
  return isPageDesignWritableComponentPayloadKey(normalized) || NATIVE_HTML_TAGS.has(normalized)
}

// ── LLM 参数读取与运行时校验 ──────────────────────────────

function readLookupParams(args: unknown, actionName: string): SparkNodeTreeLookupParams {
  const record = requireArgRecord(args, `${actionName}.params`)
  return { componentId: requireStringField(record, 'componentId', `${actionName}.componentId`) }
}

function readChildrenParams(args: unknown): SparkNodeTreeChildrenParams {
  const record = requireArgRecord(args, 'listChildren.params')
  const parentComponentId = readOptionalParentComponentId(record)
  return parentComponentId === undefined ? {} : { parentComponentId }
}

function readFindByTypeParams(args: unknown): SparkNodeFindByTypeParams {
  const record = requireArgRecord(args, 'findByType.params')
  const startComponentId = optionalStringField(record, 'startComponentId', 'findByType.startComponentId')
  const limit = optionalNumberField(record, 'limit', 'findByType.limit')
  return {
    type: requireStringField(record, 'type', 'findByType.type'),
    ...(startComponentId === undefined ? {} : { startComponentId }),
    ...(limit === undefined ? {} : { limit }),
  }
}

function readAddParams(args: unknown): SparkNodeTreeAddParams {
  const record = requireArgRecord(args, 'addNode.params')
  const parentComponentId = readOptionalParentComponentId(record)
  const index = optionalNumberField(record, 'index', 'addNode.index')
  return {
    node: requireSparkNodeField(record, 'node', 'addNode.node'),
    ...(parentComponentId === undefined ? {} : { parentComponentId }),
    ...(index === undefined ? {} : { index }),
  }
}

function readAddNodesParams(args: unknown): SparkNodeTreeAddNodesParams {
  const record = requireArgRecord(args, 'addNodes.params')
  const parentComponentId = readOptionalParentComponentId(record)
  const index = optionalNumberField(record, 'index', 'addNodes.index')
  return {
    nodes: requireSparkNodeArrayField(record, 'nodes', 'addNodes.nodes'),
    ...(parentComponentId === undefined ? {} : { parentComponentId }),
    ...(index === undefined ? {} : { index }),
  }
}

function readMoveParams(args: unknown): SparkNodeTreeMoveParams {
  const record = requireArgRecord(args, 'moveNode.params')
  const parentComponentId = readOptionalParentComponentId(record)
  const index = optionalNumberField(record, 'index', 'moveNode.index')
  return {
    componentId: requireStringField(record, 'componentId', 'moveNode.componentId'),
    ...(parentComponentId === undefined ? {} : { parentComponentId }),
    ...(index === undefined ? {} : { index }),
  }
}

function readSetPropsParams(args: unknown): SparkNodeTreeSetPropsParams {
  const record = requireArgRecord(args, 'setProps.params')
  const merge = optionalBooleanField(record, 'merge', 'setProps.merge')
  return {
    componentId: requireStringField(record, 'componentId', 'setProps.componentId'),
    props: requireRecordField(record, 'props', 'setProps.props'),
    ...(merge === undefined ? {} : { merge }),
  }
}

function readSetPropsBatchParams(args: unknown): SparkNodeTreeSetPropsBatchParams {
  const record = requireArgRecord(args, 'setPropsBatch.params')
  return {
    items: requireRecordArrayField(record, 'items', 'setPropsBatch.items').map((item, index) => {
      const merge = optionalBooleanField(item, 'merge', `setPropsBatch.items[${index}].merge`)
      return {
        componentId: requireStringField(item, 'componentId', `setPropsBatch.items[${index}].componentId`),
        props: requireRecordField(item, 'props', `setPropsBatch.items[${index}].props`),
        ...(merge === undefined ? {} : { merge }),
      }
    }),
  }
}

function readReplaceParams(args: unknown): SparkNodeTreeReplaceParams {
  const record = requireArgRecord(args, 'replaceNode.params')
  return {
    componentId: requireStringField(record, 'componentId', 'replaceNode.componentId'),
    node: requireSparkNodeField(record, 'node', 'replaceNode.node'),
  }
}

function readReplaceNodesParams(args: unknown): SparkNodeTreeReplaceNodesParams {
  const record = requireArgRecord(args, 'replaceNodes.params')
  return {
    items: requireRecordArrayField(record, 'items', 'replaceNodes.items').map((item, index) => ({
      componentId: requireStringField(item, 'componentId', `replaceNodes.items[${index}].componentId`),
      node: requireSparkNodeField(item, 'node', `replaceNodes.items[${index}].node`),
    })),
  }
}

function readRemoveParams(args: unknown): SparkNodeTreeRemoveParams {
  return readLookupParams(args, 'removeNode')
}

function readRemoveNodesParams(args: unknown): SparkNodeTreeRemoveNodesParams {
  const record = requireArgRecord(args, 'removeNodes.params')
  return {
    componentIds: requireStringArrayField(record, 'componentIds', 'removeNodes.componentIds'),
  }
}

function requireArgRecord(args: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(args)) throw new Error(`${label} must be a JSON object`)
  return args
}

function readOptionalParentComponentId(record: Readonly<Record<string, unknown>>): string | null | undefined {
  const value = record['parentComponentId']
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string') return value
  throw new Error('parentComponentId must be string, null, or omitted')
}

function requireStringField(record: Readonly<Record<string, unknown>>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function optionalStringField(record: Readonly<Record<string, unknown>>, key: string, label: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

function optionalNumberField(record: Readonly<Record<string, unknown>>, key: string, label: string): number | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number') throw new Error(`${label} must be a number`)
  return value
}

function optionalBooleanField(record: Readonly<Record<string, unknown>>, key: string, label: string): boolean | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`)
  return value
}

function requireRecordField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): Record<string, unknown> {
  const value = record[key]
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function requireRecordArrayField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const value = record[key]
  if (!Array.isArray(value) || !value.every(isRecord)) throw new Error(`${label} must be an object array`)
  return value
}

function requireSparkNodeField(record: Readonly<Record<string, unknown>>, key: string, label: string): SparkNode {
  const value = record[key]
  if (!isSparkNode(value)) throw new Error(`${label} must be a SparkNode`)
  return value
}

function requireSparkNodeArrayField(record: Readonly<Record<string, unknown>>, key: string, label: string): SparkNode[] {
  const value = record[key]
  if (!Array.isArray(value) || !value.every(isSparkNode)) throw new Error(`${label} must be a SparkNode array`)
  return value
}

function requireStringArrayField(record: Readonly<Record<string, unknown>>, key: string, label: string): string[] {
  const value = record[key]
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be a string array`)
  }
  return value
}
