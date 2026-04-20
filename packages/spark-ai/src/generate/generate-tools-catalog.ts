/**
 * Generate FC Tools 目录 — 7 个 Function Calling 工具定义。
 *
 * 分两类：
 * - 查询型：queryCapabilities / queryActionSpec / queryComponentCatalog
 * - 生成型：emitPagedata / emitRuleJson / emitScriptJs / emitStyleCss
 *
 * 查询型 tool 的应答由 `dispatchGenerateTool()` 从 catalog + 内置知识库返回。
 * 生成型 tool 的应答由前端编排器校验后返回 success/error。
 *
 * ACTION_SPECS 知识库从以下来源投影生成，禁止手写重复内容：
 * - DataSet.*:       dataset-crud-tool-stills-catalog.ts
 * - SparkNode.tree:  spark-node-tree-tool-catalog.ts
 * - SparkNode.comp:  component-catalog.json -> spark-node-component-catalog.ts
 * - ScriptJs.*:      script-js-tool-catalog.ts
 * - StyleCss.*:      style-css-tool-catalog.ts
 *
 * @module generate-tools-catalog
 */

import type { ComponentCatalog } from '../catalog/types'
import { projectFcConfigGuide, projectFcDirectory, projectFcSpec } from '../catalog/catalog-projections'
import {
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE,
  type DatasetCrudToolStillParameterRow,
} from '../stills/dataset-crud-tool-stills-catalog'
import {
  SPARK_NODE_TREE_TOOL_PARAMETER_TABLE,
  type SparkNodeTreeToolParameterRow,
} from '../stills/spark-node-tree-tool-catalog'
import { SCRIPT_JS_CAPABILITY_ENTRIES } from '../stills/script-js-tool-catalog'
import { STYLE_CSS_CAPABILITY_ENTRIES } from '../stills/style-css-tool-catalog'
import { SPARK_NODE_COMPONENT_ENTRIES } from '../stills/spark-node-component-catalog'

// ═══════════════════════════════════════════════════════════════
// OpenAI Function Calling tool 定义（JSON Schema 格式）
// ═══════════════════════════════════════════════════════════════

export interface FcToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 所有 Generate 工具名称 */
export type GenerateToolName =
  | 'queryCapabilities'
  | 'queryActionSpec'
  | 'queryComponentCatalog'
  | 'emitPagedata'
  | 'emitRuleJson'
  | 'emitScriptJs'
  | 'emitStyleCss'

/** 查询型工具定义 */
const QUERY_TOOLS: FcToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'queryCapabilities',
      description: '查询当前阶段可用的系统能力列表。在生成任何配置前必须先调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          phase: {
            type: 'string',
            enum: ['data', 'ui', 'style'],
            description: '当前生成阶段',
          },
        },
        required: ['phase'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'queryActionSpec',
      description: '查询指定能力的详细操作指南：参数 Schema、使用规则、常见失败模式。',
      parameters: {
        type: 'object',
        properties: {
          capabilityId: {
            type: 'string',
            description: '能力 ID，如 DataSet.tables、SparkNode.dataKey、DataSet.relations',
          },
        },
        required: ['capabilityId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'queryComponentCatalog',
      description: '查询已注册组件的元数据（props、events、描述）。传 * 获取全部组件列表。',
      parameters: {
        type: 'object',
        properties: {
          componentType: {
            type: 'string',
            description: '组件类型（如 r-table、r-form、el-table-column）。传 * 获取全部组件列表。',
          },
        },
        required: ['componentType'],
      },
    },
  },
]

/** 生成型工具定义 */
const EMIT_TOOLS: FcToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'emitPagedata',
      description: '提交 pagedata.json 配置。调用前必须先 queryCapabilities 和 queryActionSpec。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'object',
            description: 'pagedata.json 的完整内容（DataSet 配置）',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'emitRuleJson',
      description: '提交 rule.json 配置（SparkNode 树）。调用前必须先 queryCapabilities。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'object',
            description: 'rule.json 的完整内容（SparkNode 树）',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'emitScriptJs',
      description: '提交 script.js 内容。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'script.js 的完整文本内容',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'emitStyleCss',
      description: '提交 style.css 内容。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'style.css 的完整文本内容',
          },
        },
        required: ['content'],
      },
    },
  },
]

/** 获取全部 FC 工具定义 */
export function getGenerateTools(): FcToolDefinition[] {
  return [...QUERY_TOOLS, ...EMIT_TOOLS]
}

/** 获取工具定义（OpenAI API tools 参数格式） */
export function getGenerateToolsForApi(): unknown[] {
  return getGenerateTools()
}

// ═══════════════════════════════════════════════════════════════
// 查询型 tool 分发 — 返回 tool result 内容
// ═══════════════════════════════════════════════════════════════

export type Phase = 'data' | 'ui' | 'style'

/**
 * 分发查询型 tool call，返回 tool result 的 JSON 字符串。
 * 生成型 tool（emit*）不在此分发，由编排器处理。
 */
export function dispatchQueryTool(
  toolName: string,
  args: Record<string, unknown>,
  catalog: ComponentCatalog | null,
): string {
  switch (toolName) {
    case 'queryCapabilities':
      return handleQueryCapabilities(args['phase'])
    case 'queryActionSpec':
      return handleQueryActionSpec(args['capabilityId'])
    case 'queryComponentCatalog':
      return handleQueryComponentCatalog(args['componentType'], catalog)
    default:
      return JSON.stringify({
        error: `未知的查询工具: ${toolName}`,
        hint: '先调用 queryCapabilities，再调用 queryActionSpec，最后执行具体动作。',
        availableQueryTools: ['queryCapabilities', 'queryActionSpec', 'queryComponentCatalog'],
      })
  }
}

// ═══════════════════════════════════════════════════════════════
// 能力知识库 — queryCapabilities 应答
// ═══════════════════════════════════════════════════════════════

interface CapabilityItem {
  id: string
  summary: string
}

// ═══════════════════════════════════════════════════════════════
// ActionSpec 知识库 — queryActionSpec 应答
// 从 stills catalog / component catalog 投影生成，禁止手写重复内容。
// ═══════════════════════════════════════════════════════════════

interface FailureMode {
  code: string
  when: string
  fix: string
}

interface ActionEntry {
  action: string
  type: 'request' | 'describe'
  description: string
  paramsSchema: Record<string, unknown>
  usageRules: string[]
  failureModes: FailureMode[]
}

interface ActionSpec {
  capabilityId: string
  description: string
  actions?: ActionEntry[]
  paramsSchema: Record<string, unknown>
  usageRules: string[]
  failureModes: FailureMode[]
}

// ── 投影工具函数 ──────────────────────────────────────────────

const CATALOG_ONLY_FILTER = (rule: string): boolean => !rule.includes('catalog-only') && !rule.includes('catalog 当前未注册')

/** 从 catalog 数组中安全查找条目，找不到时抛出明确错误。 */
function requireEntry<T extends { capabilityId: string }>(
  entries: readonly T[],
  capabilityId: string,
): T {
  const entry = entries.find(e => e.capabilityId === capabilityId)
  if (!entry) throw new Error(`Missing catalog entry: ${capabilityId}`)
  return entry
}

function projectDataSetRows(
  targets: ReadonlyArray<DatasetCrudToolStillParameterRow['target']>,
): ActionEntry[] {
  return DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE
    .filter(row => (targets as readonly string[]).includes(row.target))
    .map(row => ({
      action: row.action,
      type: row.type,
      description: row.description,
      paramsSchema: row.paramsSchema,
      usageRules: row.usageRules.filter(CATALOG_ONLY_FILTER),
      failureModes: [...row.failureModes],
    }))
}

function projectSparkNodeRows(
  actionNames?: readonly string[],
): ActionEntry[] {
  const rows = actionNames
    ? SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.filter(row => actionNames.includes(row.action))
    : [...SPARK_NODE_TREE_TOOL_PARAMETER_TABLE]
  return rows.map((row: SparkNodeTreeToolParameterRow) => ({
    action: row.action,
    type: row.type,
    description: row.description,
    paramsSchema: row.paramsSchema,
    usageRules: row.usageRules.filter(CATALOG_ONLY_FILTER),
    failureModes: [...row.failureModes],
  }))
}

/** 从 actions 聚合一份简洁的参数概览（action → description） */
function buildActionSummary(actions: ActionEntry[]): Record<string, string> {
  const summary: Record<string, string> = {}
  for (const a of actions) {
    const paramKeys = Object.keys(a.paramsSchema)
    const paramsHint = paramKeys.length > 0 ? ` — params: ${paramKeys.join(', ')}` : '（无参数）'
    summary[a.action] = `${a.description}${paramsHint}`
  }
  return summary
}

/** 从 actions 聚合去重的 usageRules */
function mergeRules(actions: ActionEntry[], extraRules: string[] = []): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rule of [...extraRules, ...actions.flatMap(a => a.usageRules)]) {
    if (!seen.has(rule)) {
      seen.add(rule)
      result.push(rule)
    }
  }
  return result
}

/** 从 actions 聚合去重的 failureModes */
function mergeFailures(actions: ActionEntry[], extra: FailureMode[] = []): FailureMode[] {
  const seen = new Set<string>()
  const result: FailureMode[] = []
  for (const fm of [...extra, ...actions.flatMap(a => a.failureModes)]) {
    if (!seen.has(fm.code)) {
      seen.add(fm.code)
      result.push(fm)
    }
  }
  return result
}

function buildFromActions(
  capabilityId: string,
  description: string,
  actions: ActionEntry[],
  extraRules: string[] = [],
  extraFailures: FailureMode[] = [],
  summarySchema?: Record<string, unknown>,
): ActionSpec {
  return {
    capabilityId,
    description,
    actions,
    paramsSchema: summarySchema ?? buildActionSummary(actions),
    usageRules: mergeRules(actions, extraRules),
    failureModes: mergeFailures(actions, extraFailures),
  }
}

// ── DataSet.* — 从 dataset-crud-tool-stills-catalog 投影 ──────

const DS_TABLES_SPEC = buildFromActions(
  'DataSet.tables',
  '数据表管理 — 创建、更新、删除、查询数据表',
  projectDataSetRows(['dataset', 'table']),
  [
    '每个表必须有 tableName',
    '至少有一列设置 isPrimaryKey: true',
    '列的 name 使用 camelCase',
    '内联数据表（有 rows）不需要 api 配置',
    '远程数据表（有 api.list）不需要 rows',
  ],
  [
    { code: 'NO_PRIMARY_KEY', when: 'currentRow 总是 null', fix: '在主键列设置 isPrimaryKey: true' },
    { code: 'NO_DATA_SOURCE', when: '表格无数据', fix: '至少提供 rows（views.default.rows）或 api.list' },
  ],
)

const DS_COLUMNS_SPEC = buildFromActions(
  'DataSet.columns',
  '列定义管理 — 创建、更新、删除、查询列（含计算列 computeExpression）',
  projectDataSetRows(['column']),
  [
    '主键列必须设置 isPrimaryKey: true（每表至少一个）',
    'computeExpression 中直接引用行字段名（如 price * qty）',
    '单表达式不需要 return；多语句函数体必须每条路径都有 return',
    '子表聚合函数：$sum("Items","amount")、$count("Items")、$avg、$min、$max、$list、$join',
  ],
  [
    { code: 'COMPUTE_UNDEFINED', when: '计算列结果为 undefined', fix: '多语句函数体必须确保所有代码路径都有 return' },
    { code: 'AGGREGATE_NO_RELATION', when: '聚合函数返回 0', fix: '先在 tableRelations 中配置父子关系' },
  ],
)

const DS_RELATIONS_SPEC = buildFromActions(
  'DataSet.relations',
  '表间级联关系（relation + dependency）管理',
  projectDataSetRows(['relation', 'dependency']),
  [
    'parentField 通常是父表的 isPrimaryKey 列',
    'childField 必须存在于 childTable 的 columns 中',
    '父表必须有 autoCurrentFirst: true（在默认视图中）才能触发级联',
    '子表数据在父行切换时自动级联过滤',
  ],
  [
    { code: 'CASCADE_NOT_TRIGGERED', when: '级联不触发', fix: '在父表默认视图中设置 autoCurrentFirst: true' },
    { code: 'CHILD_FIELD_MISMATCH', when: '子表数据不更新', fix: '检查 childField 是否与子表 columns 的 name 一致' },
  ],
)

const DS_VIEWS_SPEC = buildFromActions(
  'DataSet.views',
  '视图配置管理 — autoCurrentFirst、aggregates 聚合、treeConfig',
  projectDataSetRows(['view']),
  [
    '父表（有子表依赖的表）必须设置 autoCurrentFirst: true',
    '视图在 tables.TableName.views.default 中配置',
    '如果不需要自定义视图配置，可以省略 views 字段（框架自动创建 default 视图）',
    'aggregates 的 type 可选：sum / count / avg / min / max / join',
  ],
  [
    { code: 'CASCADE_CHILD_EMPTY', when: '级联子表无数据', fix: '设置父表默认视图 autoCurrentFirst: true' },
    { code: 'SUMMARY_EMPTY', when: 'summaryRow 为空', fix: '在视图中添加 aggregates 配置' },
  ],
)

const DS_TREECONFIG_SPEC: ActionSpec = {
  capabilityId: 'DataSet.treeConfig',
  description: '树形数据配置 — idField / parentIdField / textField / treeMode',
  paramsSchema: {
    idField: 'string — 节点 ID 字段名',
    parentIdField: 'string — 父节点 ID 字段名',
    textField: 'string — 显示文本字段名',
    treeMode: '"flat" | "nested" — 数据模式（默认 flat）',
    depthLimit: 'number? — 最大展开深度',
    lazy: 'boolean? — 是否懒加载',
    _配置位置: 'treeConfig 在视图（views.default）级别配置，通过 DataView.treeConfig 传递',
  },
  usageRules: [
    'treeConfig 配置在视图级别（tables.TableName.views.default.treeConfig）',
    '与 r-tree 组件配合使用',
    'flat 模式需要 parentIdField；nested 模式数据已是嵌套结构',
    '字段名（idField、parentIdField、textField）必须与 columns 中的 name 一致',
  ],
  failureModes: [
    { code: 'TREE_FIELD_MISMATCH', when: 'idField/parentIdField 与列名不匹配', fix: '确保 treeConfig 字段名与 columns 一致' },
    { code: 'TREE_NOT_DISPLAY', when: '树不显示', fix: '检查 dataKey 是否指向正确的表、treeConfig 是否在视图级别配置' },
  ],
}

// ── SparkNode.* — 树操作来自 spark-node-tree-tool-catalog；组件知识来自 component-catalog.json 经 spark-node-component-catalog.ts 投影 ──

const SN_STRUCTURE_SPEC = buildFromActions(
  'SparkNode.structure',
  'SparkNode ≡ h(type, props, children) 三段式模型 + SparkNodeTree 操作',
  projectSparkNodeRows(),
  [
    'SparkNode ≡ h(type, props, children)：type 是渲染什么，props 是所有属性，children 是子节点',
    'type 使用 kebab-case（如 r-table，不是 RTable），必须先 queryComponentCatalog(type) 确认存在',
    '⚠️ 每个组件有独立的 props 规格 — 使用前必须 queryComponentCatalog(type) 查询可用 props、events、嵌套规则',
    'props 包含所有属性（dataKey、field、label、on、visible、disabled 等均在 props 中）',
    '根级允许的便捷字段：dataKey、field、id、on、visible、disabled、label、style、class — 绑定阶段自动收入 props',
  ],
  [
    { code: 'COMPONENT_NOT_FOUND', when: '组件不渲染', fix: '先调用 queryComponentCatalog(type) 确认组件存在' },
    { code: 'PROP_NOT_SUPPORTED', when: '属性不生效', fix: '调用 queryComponentCatalog(type) 查询该组件的可用 props 列表' },
  ],
  // For paramsSchema, show the SparkNode model (most useful for LLM)
  {
    type: 'string — 组件类型（kebab-case），必须通过 queryComponentCatalog(type) 确认存在',
    props: 'object — 该组件接收的全部属性；每个组件的可用 props 不同，必须查询组件元数据确认',
    children: 'SparkNode[] | (string | number | SparkNode)[] — 子节点数组',
    _树操作: '详见 actions[]: getNode / addNode / setProps / replaceNode / removeNode 等',
  },
)

const SN_DATAKEY_SPEC = buildFromActions(
  'SparkNode.dataKey',
  'dataKey 数据绑定 — table@field / table@viewId@field 格式',
  projectSparkNodeRows(['sparkNodeTree.collectDataKeys']),
  [
    '2 段格式：table@field（viewId 默认 default）— 如 Users@rows',
    '3 段格式：table@viewId@field — 如 Users@grid@rows',
    'field 可选值：rows / currentRow / selectedRows / summaryRow / selectionSummaryRow',
    '容器组件（r-table / r-form / r-detail）使用 rows / currentRow',
    '⚠️ table 名必须与 pagedata.json 中的 tableName 完全一致',
    '跨页面：#scope@table@field（如 #SharedDS@Orders@rows）',
  ],
  [
    { code: 'DATAKEY_TABLE_MISMATCH', when: '表格无数据', fix: '确保 dataKey 的第一段与 tables 中的 tableName 一致' },
    { code: 'DATAKEY_FIELD_WRONG', when: '表单无数据', fix: 'r-form 使用 table@currentRow，r-table 使用 table@rows' },
  ],
  {
    dataKey: 'string — 格式: table@field 或 table@viewId@field',
    _2段示例: '"Users@rows"（viewId 默认 default）',
    _3段示例: '"Users@grid@rows"',
    _field可选值: 'rows / currentRow / selectedRows / summaryRow / selectionSummaryRow',
  },
)

const SN_EVENTS_SPEC = buildFromActions(
  'SparkNode.events',
  '事件绑定 — on.click → script.js 函数名',
  projectSparkNodeRows(['sparkNodeTree.collectHandlerNames']),
  [
    '事件名使用原生名称（如 click、change、input）',
    'handler 值为 script.js 中定义的函数名（字符串）',
    '⚠️ handler 函数必须在 script.js 中定义，否则运行时报错',
  ],
  [
    { code: 'HANDLER_NOT_FOUND', when: '点击无反应', fix: '确保 on.click 的值与 script.js 的函数名字符串完全一致' },
  ],
  {
    on: 'Record<eventName, handlerFunctionName> — 事件绑定',
    _示例: '{ "click": "handleSubmit", "change": "handleChange" }',
  },
)

// SparkNode.containers 和 SparkNode.fields — 事实源是 component-catalog.json，这里消费 spark-node-component-catalog.ts 的投影结果
const SN_CONTAINERS_SPEC = buildFromKnowledgeEntry(
  requireEntry(SPARK_NODE_COMPONENT_ENTRIES, 'SparkNode.containers'),
)
const SN_FIELDS_SPEC = buildFromKnowledgeEntry(
  requireEntry(SPARK_NODE_COMPONENT_ENTRIES, 'SparkNode.fields'),
)

// ── ScriptJs.* — 从 script-js-tool-catalog 投影 ──

function buildFromKnowledgeEntry(entry: {
  capabilityId: string
  description: string
  paramsSchema: Record<string, unknown>
  usageRules: readonly string[]
  failureModes: ReadonlyArray<{ code: string; when: string; fix: string }>
}): ActionSpec {
  return {
    capabilityId: entry.capabilityId,
    description: entry.description,
    paramsSchema: entry.paramsSchema,
    usageRules: [...entry.usageRules],
    failureModes: [...entry.failureModes],
  }
}

const SJ_SANDBOX_SPEC = buildFromKnowledgeEntry(
  requireEntry(SCRIPT_JS_CAPABILITY_ENTRIES, 'ScriptJs.sandbox'),
)
const SJ_INIT_SPEC = buildFromKnowledgeEntry(
  requireEntry(SCRIPT_JS_CAPABILITY_ENTRIES, 'ScriptJs.init'),
)

// ── StyleCss.* — 从 style-css-tool-catalog 投影 ──

const SC_PAGESCOPE_SPEC = buildFromKnowledgeEntry(
  requireEntry(STYLE_CSS_CAPABILITY_ENTRIES, 'StyleCss.pageScope'),
)
const SC_ELEMENTPLUS_SPEC = buildFromKnowledgeEntry(
  requireEntry(STYLE_CSS_CAPABILITY_ENTRIES, 'StyleCss.elementPlus'),
)
const SC_LAYOUT_SPEC = buildFromKnowledgeEntry(
  requireEntry(STYLE_CSS_CAPABILITY_ENTRIES, 'StyleCss.layout'),
)

// ── ACTION_SPECS 汇总注册表 ──

const ACTION_SPECS: Record<string, ActionSpec> = {
  'DataSet.tables': DS_TABLES_SPEC,
  'DataSet.columns': DS_COLUMNS_SPEC,
  'DataSet.relations': DS_RELATIONS_SPEC,
  'DataSet.views': DS_VIEWS_SPEC,
  'DataSet.treeConfig': DS_TREECONFIG_SPEC,
  'SparkNode.structure': SN_STRUCTURE_SPEC,
  'SparkNode.dataKey': SN_DATAKEY_SPEC,
  'SparkNode.events': SN_EVENTS_SPEC,
  'SparkNode.containers': SN_CONTAINERS_SPEC,
  'SparkNode.fields': SN_FIELDS_SPEC,
  'ScriptJs.sandbox': SJ_SANDBOX_SPEC,
  'ScriptJs.init': SJ_INIT_SPEC,
  'StyleCss.pageScope': SC_PAGESCOPE_SPEC,
  'StyleCss.elementPlus': SC_ELEMENTPLUS_SPEC,
  'StyleCss.layout': SC_LAYOUT_SPEC,
}

const CAPABILITY_PHASES: Record<string, Phase> = {
  'DataSet.tables': 'data',
  'DataSet.columns': 'data',
  'DataSet.relations': 'data',
  'DataSet.views': 'data',
  'DataSet.treeConfig': 'data',
  'SparkNode.structure': 'ui',
  'SparkNode.dataKey': 'ui',
  'SparkNode.events': 'ui',
  'SparkNode.containers': 'ui',
  'SparkNode.fields': 'ui',
  'ScriptJs.sandbox': 'ui',
  'ScriptJs.init': 'ui',
  'StyleCss.pageScope': 'style',
  'StyleCss.elementPlus': 'style',
  'StyleCss.layout': 'style',
}

function getCapabilityPhase(capabilityId: string): Phase | null {
  return CAPABILITY_PHASES[capabilityId] ?? null
}

function summarizeCapability(spec: ActionSpec): string {
  if (spec.actions && spec.actions.length > 0) {
    return `${spec.description}（${spec.actions.length} actions）`
  }
  return spec.description
}

function listCapabilitiesByPhase(phase: Phase): CapabilityItem[] {
  return Object.entries(ACTION_SPECS)
    .filter(([capabilityId]) => getCapabilityPhase(capabilityId) === phase)
    .map(([capabilityId, spec]) => ({
      id: capabilityId,
      summary: summarizeCapability(spec),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function parsePhaseArg(phase: unknown): Phase | null {
  return phase === 'data' || phase === 'ui' || phase === 'style' ? phase : null
}

function handleQueryCapabilities(phaseArg: unknown): string {
  const phase = parsePhaseArg(phaseArg)
  if (phase === null) {
    return JSON.stringify({
      error: `phase 非法: ${String(phaseArg)}`,
      hint: 'phase 仅支持 data | ui | style；请先调用 queryCapabilities({ phase }) 获取目录，再用 queryActionSpec 获取参数规格。',
      supportedPhases: ['data', 'ui', 'style'],
    })
  }

  return JSON.stringify({
    phase,
    capabilities: listCapabilitiesByPhase(phase),
    nextStep: '从 capabilities 中选择 capabilityId，调用 queryActionSpec 获取完整参数规范。',
  })
}

function suggestCapabilityIds(input: string): string[] {
  const needle = input.trim().toLowerCase()
  if (needle.length === 0) return []
  return Object.keys(ACTION_SPECS)
    .filter((id) => {
      const lower = id.toLowerCase()
      return lower.includes(needle) || needle.includes(lower)
    })
    .slice(0, 5)
}

function handleQueryActionSpec(capabilityIdArg: unknown): string {
  if (typeof capabilityIdArg !== 'string' || capabilityIdArg.length === 0) {
    return JSON.stringify({
      error: 'capabilityId 缺失或非法',
      hint: '先调用 queryCapabilities 获取 capabilityId，再调用 queryActionSpec({ capabilityId })。',
    })
  }
  const capabilityId = capabilityIdArg
  const spec = ACTION_SPECS[capabilityId]
  if (spec !== undefined) {
    return JSON.stringify(spec)
  }
  const suggestions = suggestCapabilityIds(capabilityId)
  return JSON.stringify({
    error: `未知能力 ID: ${capabilityId}`,
    hint: '请先调用 queryCapabilities 获取当前阶段的能力列表',
    ...(suggestions.length > 0 ? { suggestions } : {}),
  })
}

// ═══════════════════════════════════════════════════════════════
// 组件目录查询 — queryComponentCatalog 应答
// ═══════════════════════════════════════════════════════════════

function handleQueryComponentCatalog(
  componentTypeArg: unknown,
  catalog: ComponentCatalog | null,
): string {
  if (typeof componentTypeArg !== 'string' || componentTypeArg.length === 0) {
    return JSON.stringify({
      error: 'componentType 缺失或非法',
      hint: '传入具体组件 type（如 r-table）或 * 获取完整目录。',
    })
  }
  const componentType = componentTypeArg
  if (catalog === null) {
    return JSON.stringify({ error: '组件目录未加载' })
  }

  if (componentType === '*') {
    return JSON.stringify(projectFcDirectory(catalog))
  }

  const spec = projectFcSpec(catalog, componentType)
  const guide = projectFcConfigGuide(catalog, componentType)
  if (spec !== null && guide !== null) {
    return JSON.stringify({ spec, guide })
  }

  return JSON.stringify({
    error: `未找到组件: ${componentType}`,
    hint: '请传 * 查看全部可用组件列表',
  })
}
