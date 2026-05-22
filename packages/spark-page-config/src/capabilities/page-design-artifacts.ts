/**
 * 页面设计期工件：组件元数据、规则树策略、JSON Schema、100 步流程、DataSet 设计投影。
 *
 * 由以下 6 个 design 文件合并而成：
 *   rule-editor-metadata / rule-tree-policy / rule-json-schema /
 *   page-data-json-schema / page-design-100-step-flow / page-design-designer-projection
 */

// ── SECTION 1: 规则编辑器组件元数据（原 rule-editor-metadata.ts）────

import type { JsonObject, JsonValue } from './json-document'

export type RuleEditorComponentMetadata = {
  types: string[]
  propNames: Record<string, string[]>
  propEnums: Record<string, Record<string, string[]>>
  typeLabels: Record<string, string>
  requiredProps: Record<string, JsonObject>
}

export type RuleEditorComponentCatalogProp = {
  name: string
  type?: string
  required?: boolean
  default?: string
  description?: string
}

export type RuleEditorComponentCatalogEntry = {
  type: string
  category?: string
  description?: string
  internal?: boolean
  configurable?: boolean
  notes?: string
  provides?: readonly string[]
  consumes?: readonly string[]
  props?: readonly RuleEditorComponentCatalogProp[]
}

export type RuleEditorComponentCatalog = {
  version: string
  componentCount: number
  components: Readonly<Record<string, RuleEditorComponentCatalogEntry>>
}

export type RuleEditorComponentMetadataSource = RuleEditorComponentMetadata | RuleEditorComponentCatalog

export const EMPTY_RULE_EDITOR_COMPONENT_METADATA: RuleEditorComponentMetadata = {
  types: [],
  propNames: {},
  propEnums: {},
  typeLabels: {},
  requiredProps: {},
}

const STRUCT_KEYS = new Set(['type', 'props', 'children', 'id'])

export function createRuleEditorComponentMetadata(
  source?: RuleEditorComponentMetadataSource,
): RuleEditorComponentMetadata {
  if (source === undefined) return EMPTY_RULE_EDITOR_COMPONENT_METADATA
  if (isRuleEditorComponentMetadata(source)) return source

  const entries = Object.values(source.components)
    .filter((entry) => entry.type.trim().length > 0 && entry.internal !== true && entry.configurable !== false)
    .sort((left, right) => left.type.localeCompare(right.type))

  const propNames: Record<string, string[]> = {}
  const propEnums: Record<string, Record<string, string[]>> = {}
  const typeLabels: Record<string, string> = {}
  const requiredProps: Record<string, JsonObject> = {}

  for (const entry of entries) {
    const props = (entry.props ?? []).filter(isConfigurableProp)
    propNames[entry.type] = props.map((prop) => prop.name)
    typeLabels[entry.type] = createTypeLabel(entry)

    const enumEntries = props
      .map((prop): [string, string[]] => [prop.name, parseEnumFromTypeString(prop.type ?? '')])
      .filter(([, values]) => values.length > 0)
    if (enumEntries.length > 0) {
      propEnums[entry.type] = Object.fromEntries(enumEntries)
    }

    const required: JsonObject = {}
    for (const prop of props) {
      if (prop.required === true) required[prop.name] = inferDefaultFromProp(prop)
    }
    if (Object.keys(required).length > 0) {
      requiredProps[entry.type] = required
    }
  }

  return {
    types: entries.map((entry) => entry.type),
    propNames,
    propEnums,
    typeLabels,
    requiredProps,
  }
}

function isRuleEditorComponentMetadata(source: RuleEditorComponentMetadataSource): source is RuleEditorComponentMetadata {
  return 'types' in source && 'propNames' in source && 'propEnums' in source && 'typeLabels' in source && 'requiredProps' in source
}

function isConfigurableProp(prop: RuleEditorComponentCatalogProp): boolean {
  return !STRUCT_KEYS.has(prop.name)
}

function parseEnumFromTypeString(type: string): string[] {
  const values = [...type.matchAll(/["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter((value): value is string => value !== undefined && value.length > 0)
  return values.length >= 2 ? [...new Set(values)] : []
}

function inferDefaultFromProp(prop: RuleEditorComponentCatalogProp): JsonValue {
  if (prop.default !== undefined) return parseJsonDefault(prop.default)

  const type = (prop.type ?? '').toLowerCase()
  if (type.includes('number')) return 0
  if (type.includes('boolean')) return false
  if (type.includes('[]') || type.includes('array')) return []
  return ''
}

function parseJsonDefault(raw: string): JsonValue {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isJsonValue(parsed)) throw new Error('default prop metadata is not JSON serializable')
    return parsed
  } catch {
    return raw
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createTypeLabel(entry: RuleEditorComponentCatalogEntry): string {
  const label = extractShortLabel(entry.description)
  return label.length > 0 ? `[${label}] ${entry.type}` : entry.type
}

function extractShortLabel(description: string | undefined): string {
  const match = /^([一-鿿]+)/.exec(description ?? '')
  if (!match?.[1]) return ''
  const label = match[1].replace(/(?:容器|组件|字段|节点|页面)$/, '')
  return label.length >= 2 ? label : ''
}

// ── SECTION 2: 规则树编辑策略（原 rule-tree-policy.ts）──────────────

import type { AutoPopulateEntry, JsonPath, JsonTreePolicy } from './json-document'
import { ensureUniqueObjectKey } from './json-document'

const SPARK_NODE_STRUCT_KEYS = new Set(['type', 'props', 'children'])

function isSparkNodeRoot(path: JsonPath): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  if (typeof last !== 'number') return false
  if (path.length === 1) return true
  const prev = path[path.length - 2]
  return prev === 'children'
}

function isTypeField(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'type') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

function isChildrenArray(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'children') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

function isPropsObject(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'props') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

const EXTRA_TYPE_LABELS: Record<string, string> = {
  div: '[块容器] div',
  span: '[行内容器] span',
  p: '[段落] p',
  a: '[链接] a',
  img: '[图片] img',
  h1: '[一级标题] h1',
  h2: '[二级标题] h2',
  h3: '[三级标题] h3',
  h4: '[四级标题] h4',
  ul: '[无序列表] ul',
  ol: '[有序列表] ol',
  li: '[列表项] li',
  table: '[表格] table',
  thead: '[表头] thead',
  tbody: '[表体] tbody',
  tr: '[表行] tr',
  th: '[表头单元格] th',
  td: '[表单元格] td',
  form: '[表单] form',
  input: '[输入框] input',
  button: '[按钮] button',
  label: '[标签] label',
  textarea: '[文本域] textarea',
  select: '[选择框] select',
  option: '[选项] option',
  section: '[区块] section',
  header: '[页头] header',
  footer: '[页脚] footer',
  nav: '[导航] nav',
  main: '[主体] main',
  aside: '[侧栏] aside',
  article: '[文章] article',
  pre: '[预格式] pre',
  code: '[代码] code',
  br: '[换行] br',
  hr: '[分隔线] hr',
  i: '[图标/斜体] i',
  strong: '[加粗] strong',
  em: '[强调] em',
  template: '[模板] template',
  slot: '[插槽] slot',
  component: '[动态组件] component',
  transition: '[过渡] transition',
  'transition-group': '[过渡组] transition-group',
  'keep-alive': '[缓存] keep-alive',
  teleport: '[传送] teleport',
  'nav-icon': '[导航图标] nav-icon',
  'module-context-badge': '[模块徽章] module-context-badge',
  'icon-picker': '[图标选择器] icon-picker',
  'error-fallback': '[错误回退] error-fallback',
  'spark-json-editor': '[JSON编辑器] spark-json-editor',
  'json-tree-editor': '[JSON树编辑器] json-tree-editor',
  'r-column-group': '[分组列] r-column-group',
}

function getTypeLabelOptions(metadata: RuleEditorComponentMetadata): Array<{ label: string; value: string }> {
  const merged = { ...EXTRA_TYPE_LABELS, ...metadata.typeLabels }
  return Object.entries(merged)
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

function isProtected(path: JsonPath): boolean {
  if (isTypeField(path)) return true
  if (isChildrenArray(path)) return true
  if (isPropsObject(path)) return true
  return false
}

function canEditKey(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (typeof last === 'string' && SPARK_NODE_STRUCT_KEYS.has(last)) {
    if (isSparkNodeRoot(path.slice(0, -1))) return false
  }
  return typeof last === 'string'
}

function canEditType(path: JsonPath): boolean {
  if (path.length === 0) return false
  if (isTypeField(path)) return false
  if (isSparkNodeRoot(path)) return false
  if (isChildrenArray(path)) return false
  if (isPropsObject(path)) return false
  return true
}

function suggestChildKey(target: JsonObject, parentPath: JsonPath, metadata: RuleEditorComponentMetadata): string {
  if (isSparkNodeRoot(parentPath)) {
    const preferredKeys = ['props', 'children', 'id']
    for (const key of preferredKeys) {
      if (!(key in target)) return key
    }
    return ensureUniqueObjectKey(target, 'custom')
  }

  if (isPropsObject(parentPath)) {
    const preferredProps = ['dataViewKey', 'dataMember', 'dataField', 'field', 'label', 'visible', 'disabled']
    for (const key of preferredProps) {
      if (!(key in target)) return key
    }
    const sparkNode = parentPath.length >= 2 ? undefined : target
    const typeValue = sparkNode !== undefined ? sparkNode['type'] : undefined
    if (typeof typeValue === 'string' && metadata.propNames[typeValue] !== undefined) {
      for (const key of metadata.propNames[typeValue]) {
        if (!(key in target)) return key
      }
    }
    return ensureUniqueObjectKey(target, 'newProp')
  }

  return ensureUniqueObjectKey(target, 'newKey')
}

function createDefaultArrayItem(parentPath: JsonPath): JsonValue {
  if (isChildrenArray(parentPath)) return { type: 'div' }
  return ''
}

function createDefaultObjectValue(parentPath: JsonPath, key: string): JsonValue {
  if (isSparkNodeRoot(parentPath)) {
    if (key === 'props') return {}
    if (key === 'children') return []
    if (key === 'id') return ''
    return ''
  }
  if (isPropsObject(parentPath)) {
    if (key === 'visible' || key === 'disabled') return false
    if (key === 'on') return {}
    return ''
  }
  return ''
}

function isPropsChildValue(path: JsonPath): { propName: string } | null {
  if (path.length < 2) return null
  const last = path[path.length - 1]
  if (typeof last !== 'string') return null
  const parentPath = path.slice(0, -1)
  if (isPropsObject(parentPath)) return { propName: last }
  return null
}

export function createRuleTreePolicy(
  metadataSource?: RuleEditorComponentMetadataSource,
): JsonTreePolicy {
  const metadata = createRuleEditorComponentMetadata(metadataSource)

  return {
    rootLabel: 'rule',
    isProtected,
    canEditKey,
    canEditType,
    suggestChildKey: (target, parentPath) => suggestChildKey(target, parentPath, metadata),
    createDefaultArrayItem,
    createDefaultObjectValue,
    getValueOptions(path: JsonPath): string[] | undefined {
      const propInfo = isPropsChildValue(path)
      if (propInfo === null) return undefined
      const merged = new Set<string>()
      for (const typeEnums of Object.values(metadata.propEnums)) {
        const vals = typeEnums[propInfo.propName]
        if (vals !== undefined) {
          for (const value of vals) merged.add(value)
        }
      }
      return merged.size > 0 ? [...merged] : undefined
    },
    getValueLabels(path: JsonPath): Array<{ label: string; value: string }> | undefined {
      if (isTypeField(path)) return getTypeLabelOptions(metadata)
      return undefined
    },
    getAutoPopulate(changedPath: JsonPath, newValue: JsonValue): AutoPopulateEntry[] | undefined {
      if (!isTypeField(changedPath) || typeof newValue !== 'string') return undefined
      const requiredProps = metadata.requiredProps[newValue]
      if (requiredProps === undefined) return [{
        targetPath: changedPath.slice(0, -1),
        entries: { props: {} },
      }]

      const propsEntries: Record<string, JsonValue> = {}
      for (const [name, value] of Object.entries(requiredProps)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
          propsEntries[name] = value
        } else if (Array.isArray(value)) {
          propsEntries[name] = value
        } else if (typeof value === 'object') {
          propsEntries[name] = value
        }
      }

      return [{
        targetPath: changedPath.slice(0, -1),
        entries: { props: propsEntries },
      }]
    },
  }
}

// ── SECTION 3: 规则 JSON Schema（原 rule-json-schema.ts）─────────────

type JsonSchemaNode = {
  [key: string]: unknown
}

function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}

export function createRuleJsonSchema(
  metadataSource?: RuleEditorComponentMetadataSource,
): Record<string, unknown> {
  const metadata = createRuleEditorComponentMetadata(metadataSource)

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SPARK 页面规则配置',
    description: 'SparkNode 数组，描述页面组件树。每个节点对齐 Vue h(type, props, children) 三段式。',
    type: 'array',
    items: { $ref: '#/$defs/sparkNode' },
    $defs: {
      sparkNode: withMeta('组件节点 Component Node', '严格对齐 SparkNode 结构：type / id / props / children。id 是节点顶层稳定标识，禁止写入 props.id。', {
        type: 'object',
        properties: {
          type: withMeta('组件类型 Component Type', '组件注册名（kebab-case），如 r-table / el-button / div。', { type: 'string', enum: metadata.types }),
          id: withMeta('节点标识 Component ID', 'SparkNode 顶层稳定 id，用于脚本寻址和渲染 key。不要放到 props.id。', { type: 'string' }),
          props: withMeta('组件属性 Props', '传给组件的业务属性。dataViewKey / dataMember / dataField / contextDataMember / contextDataField / field / label / on / visible / disabled 等在此声明；id 必须写在节点顶层。', {
            type: 'object',
            additionalProperties: true,
          }),
          children: withMeta('子节点 Children', '子组件配置数组（递归 SparkNode），也可包含字符串/数字文本子节点。', {
            type: 'array',
            items: {
              oneOf: [
                { $ref: '#/$defs/sparkNode' },
                { type: 'string', title: '文本子节点 Text Node', description: '纯文本内容。' },
                { type: 'number', title: '数字子节点 Number Node', description: '数字文本内容。' },
              ],
            },
          }),
          dataViewKey: withMeta('DataView 定位键 DataView Key', 'DataViewKey 格式：table@viewId 或 #scope@table@viewId。', { type: 'string' }),
          dataMember: withMeta('DataView 成员 Data Member', 'DataView 成员枚举，如 rows、currentRow、aggregateResult。', {
            type: 'string',
            enum: ['rows', 'columns', 'currentRow', 'selectedRows', 'aggregateResult', 'selectionAggregateResult', 'total', 'page', 'pageSize', 'requestState', 'mutating', 'loadingError', 'mutatingError'],
          }),
          dataField: withMeta('DataView 成员字段 Data Field', 'DataView 成员内部业务字段或点路径，如 name、totalAmount。', { type: 'string' }),
          contextDataMember: withMeta('上下文 DataView 成员 Context Data Member', 'r-form / r-detail 的上下文成员，默认通常为 currentRow。', { type: 'string' }),
          contextDataField: withMeta('上下文字段 Context Data Field', '上下文成员内部业务字段或点路径。', { type: 'string' }),
          field: withMeta('字段名 Field', '字段组件绑定的列名。', { type: 'string' }),
          label: withMeta('标签 Label', '字段组件或列的显示标题。', { type: 'string' }),
          on: withMeta('事件绑定 Events', '事件名到 script.js 函数名的映射，如 { "click": "handleClick" }。', {
            type: 'object',
            additionalProperties: { type: 'string' },
          }),
          visible: withMeta('是否可见 Visible', '控制组件可见性。false 时组件不渲染。', { type: 'boolean' }),
          disabled: withMeta('是否禁用 Disabled', '控制组件禁用状态。', { type: 'boolean' }),
          style: withMeta('内联样式 Style', 'CSS 样式对象（camelCase）。', {
            type: 'object',
            additionalProperties: true,
          }),
          class: withMeta('CSS 类名 Class', 'CSS 类名字符串。', { type: 'string' }),
          name: withMeta('元素名称 Name', '表单元素命名，用于 DOM 查询。', { type: 'string' }),
        },
        required: ['type'],
        additionalProperties: true,
      }),
    },
  }
}

// ── SECTION 4: 页面数据 JSON Schema（原 page-data-json-schema.ts）────

import {
  canonicalizePageDataJson,
} from './page-file-document'

export type PageDataEditorMode = 'tree' | 'text' | 'table'

const knownColumnTypes = [
  'number',
  'int',
  'integer',
  'decimal',
  'float',
  'double',
  'string',
  'varchar',
  'text',
  'boolean',
  'bool',
  'date',
  'datetime',
  'time',
  'object',
  'array',
  'enum',
]
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const aggregateTypes = ['sum', 'count', 'avg', 'min', 'max', 'join']
const dependencyTypes = ['currentRow', 'selectedRows', 'allRows', 'pagedRows']
const sortDirections = ['asc', 'desc']
const treeModes = ['flat', 'nested']
const commitModes = ['immediate', 'staged']
const resourceTypes = [
  'database-table',
  'database-view',
  'third-party-api',
  'static-data',
  'dictionary',
  'logical-view',
]
const businessCategories = ['master', 'child', 'reference']

export function canUseStructuredPageDataEditor(rawText: string): boolean {
  if (rawText.trim() === '') return false
  try {
    canonicalizePageDataJson(rawText)
    return true
  } catch {
    return false
  }
}

export const PAGE_DATA_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SPARK 标准化页面数据',
  description: 'SPARK DataSet 的标准序列化结构。术语与 spark-data 运行时保持一致。',
  type: 'object',
  properties: {
    schemaVersion: withMeta('Schema 版本号', '当前 pagedata.json 使用的结构版本号。', { type: 'number' }),
    dataSetName: withMeta('DataSet 名称', '当前页面数据空间的名称。', { type: 'string' }),
    tables: withMeta('数据表集合', 'DataSet 中的全部数据表。', {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/tableMetadata' },
    }),
    tableRelations: withMeta('表关系集合', '描述表与表之间的父子关系。', {
      type: 'array',
      items: { $ref: '#/$defs/tableRelation' },
    }),
    viewDependencies: withMeta('视图依赖集合', '描述父表 default 视图状态变化如何驱动子表 default 视图联动。', {
      type: 'array',
      items: { $ref: '#/$defs/viewDependency' },
    }),
    saveChanges: withMeta('保存策略', '描述 DataSet.saveChanges 的默认提交方式，例如走逐视图 CRUD 或后端统一事务。', {
      $ref: '#/$defs/dataSetSaveChangesConfig',
    }),
    version: withMeta('页面数据版本号', '页面数据内容本身的业务版本号，可选。', { type: 'number' }),
    pageId: withMeta('页面 ID', '当前页面配置的 pageId，可选。', { type: 'string' }),
  },
  required: ['tables'],
  additionalProperties: false,
  $defs: {
    jsonObject: withMeta('通用对象', '用于承载 headers、params、condition、crudConfig 等开放结构对象。', {
      type: 'object',
      additionalProperties: true,
    }),
    dataRow: withMeta('数据行', '表或视图中的单条行对象。键名应与列定义保持一致。', {
      type: 'object',
      additionalProperties: true,
    }),
    httpEndpoint: withMeta('HTTP 端点', '描述单个 CRUD 或树接口端点。', {
      type: 'object',
      properties: {
        url: withMeta('接口地址', '请求 URL。', { type: 'string' }),
        method: withMeta('HTTP 方法', '请求方法。', { type: 'string', enum: httpMethods }),
        headers: withMeta('请求头', '请求头键值对。', { type: 'object', additionalProperties: { type: 'string' } }),
        params: withMeta('查询参数模板', 'URL 查询参数模板。', { $ref: '#/$defs/jsonObject' }),
        pathParams: withMeta('路径参数名', '路径占位参数名数组。', { type: 'array', items: { type: 'string' } }),
        baseURL: withMeta('基础地址', '可选 API 基础地址。', { type: 'string' }),
      },
      required: ['url'],
      additionalProperties: false,
    }),
    crudApi: withMeta('CRUD API 配置', '描述每个操作对应哪个接口。', {
      type: 'object',
      properties: {
        create: { $ref: '#/$defs/httpEndpoint' },
        retrieve: { $ref: '#/$defs/httpEndpoint' },
        update: { $ref: '#/$defs/httpEndpoint' },
        delete: { $ref: '#/$defs/httpEndpoint' },
        transaction: { $ref: '#/$defs/httpEndpoint' },
        list: { $ref: '#/$defs/httpEndpoint' },
        batch: { $ref: '#/$defs/jsonObject' },
        import: { $ref: '#/$defs/httpEndpoint' },
        export: { $ref: '#/$defs/httpEndpoint' },
        node: { $ref: '#/$defs/httpEndpoint' },
        children: { $ref: '#/$defs/httpEndpoint' },
        path: { $ref: '#/$defs/httpEndpoint' },
        subtree: { $ref: '#/$defs/httpEndpoint' },
        move: { $ref: '#/$defs/httpEndpoint' },
        search: { $ref: '#/$defs/httpEndpoint' },
        nested: { $ref: '#/$defs/httpEndpoint' },
        nestedSearch: { $ref: '#/$defs/httpEndpoint' },
      },
      additionalProperties: false,
    }),
    dataSetSaveChangesConfig: withMeta('DataSet 保存策略', '描述 DataSet.saveChanges 默认采用的提交方式。transaction 模式会把 staged 变更提交到统一事务端点。', {
      type: 'object',
      properties: {
        mode: withMeta('提交模式', 'perView 为逐视图 CRUD；transaction 为统一事务提交。', { type: 'string', enum: ['perView', 'transaction'] }),
        transaction: { $ref: '#/$defs/dataSetTransactionConfig' },
      },
      additionalProperties: false,
    }),
    dataSetTransactionConfig: withMeta('统一事务配置', '描述 DataSet.saveChanges(transaction) 使用的后端事务端点与可选幂等请求号。', {
      type: 'object',
      properties: {
        endpoint: { $ref: '#/$defs/httpEndpoint' },
        requestId: withMeta('幂等请求号', '可选。重复提交相同 requestId 和相同 operations 时，后端应 replay 已提交结果。', { type: 'string' }),
      },
      required: ['endpoint'],
      additionalProperties: false,
    }),
    aggregateColumnConfig: withMeta('聚合列配置', '描述 aggregateResult / selectionAggregateResult 的聚合方式。', {
      type: 'object',
      properties: {
        type: withMeta('聚合类型', '聚合类型。', { type: 'string', enum: aggregateTypes }),
        field: withMeta('源字段名', '聚合来源字段名。', { type: 'string' }),
        label: withMeta('展示标题', '聚合结果的 UI 展示标题。', { type: 'string' }),
        separator: withMeta('拼接分隔符', 'join 聚合时使用的分隔符。', { type: 'string' }),
      },
      required: ['type'],
      additionalProperties: false,
    }),
    sortField: withMeta('排序字段', '描述单个排序字段与方向。', {
      type: 'object',
      properties: {
        field: withMeta('字段名', '参与排序的字段名。', { type: 'string' }),
        direction: withMeta('排序方向', '排序方向。', { type: 'string', enum: sortDirections }),
      },
      required: ['field'],
      additionalProperties: false,
    }),
    treeConfig: withMeta('树配置', '描述视图树形结构。', {
      type: 'object',
      properties: {
        idField: { type: 'string' },
        parentIdField: { type: 'string' },
        textField: { type: 'string' },
        depthLimit: { type: 'number' },
        lazy: { type: 'boolean' },
        treeMode: { type: 'string', enum: treeModes },
      },
      additionalProperties: false,
    }),
    dataColumn: withMeta('数据列定义', '描述数据结构与渲染元信息。', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: knownColumnTypes },
        label: { type: 'string' },
        allowDBNull: { type: 'boolean' },
        defaultValue: {},
        isPrimaryKey: { type: 'boolean' },
        autoIncrement: { type: 'boolean' },
        isComputed: { type: 'boolean' },
        required: { type: 'boolean' },
        minLength: { type: 'number' },
        maxLength: { type: 'number' },
        min: { type: 'number' },
        max: { type: 'number' },
        pattern: { type: 'string' },
        patternMessage: { type: 'string' },
        computeExpression: { type: 'string' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    }),
    viewMetadata: withMeta('视图元数据', '描述 DataView 的运行配置。', {
      type: 'object',
      properties: {
        tableName: { type: 'string' },
        viewId: { type: 'string' },
        rows: { type: 'array', items: { $ref: '#/$defs/dataRow' } },
        filterExpression: { $ref: '#/$defs/jsonObject' },
        sortExpression: { type: 'array', items: { $ref: '#/$defs/sortField' } },
        autoCurrentFirst: { type: 'boolean' },
        autoSelectFirst: { type: 'boolean' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        treeConfig: { $ref: '#/$defs/treeConfig' },
        valueField: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        labelField: { type: 'string' },
        selectionDelimiter: { type: 'string' },
        autoLoad: { type: 'boolean' },
        commitMode: { type: 'string', enum: commitModes },
        aggregates: { type: 'object', additionalProperties: { $ref: '#/$defs/aggregateColumnConfig' } },
      },
      additionalProperties: false,
    }),
    tableRelation: withMeta('表关系', '描述父表与子表之间的关联。', {
      type: 'object',
      properties: {
        relationName: { type: 'string' },
        parentTable: { type: 'string' },
        childTable: { type: 'string' },
        childField: { type: 'string' },
        parentField: { type: 'string' },
        condition: { $ref: '#/$defs/jsonObject' },
        cascadeUpdate: { type: 'boolean' },
        cascadeDelete: { type: 'boolean' },
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    viewDependency: withMeta('视图依赖', '描述父表 default 视图状态变化如何驱动子表 default 视图联动。', {
      type: 'object',
      properties: {
        parentTable: { type: 'string' },
        childTable: { type: 'string' },
        dependencyType: { type: 'string', enum: dependencyTypes },
        autoLoad: { type: 'boolean' },
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    tableMetadata: withMeta('数据表元数据', '描述一张表的列、资源语义、API 与视图配置。', {
      type: 'object',
      properties: {
        tableName: { type: 'string' },
        columns: { type: 'array', items: { $ref: '#/$defs/dataColumn' } },
        resourceType: { type: 'string', enum: resourceTypes },
        resourceId: { type: 'string' },
        businessCategory: { type: 'string', enum: businessCategories },
        api: { $ref: '#/$defs/crudApi' },
        crudConfig: { $ref: '#/$defs/jsonObject' },
        views: {
          type: 'object',
          properties: {
            default: { $ref: '#/$defs/viewMetadata' },
          },
          required: ['default'],
          additionalProperties: { $ref: '#/$defs/viewMetadata' },
        },
      },
      required: ['columns', 'views'],
      additionalProperties: false,
    }),
  },
}

// ── SECTION 5: 100 步页面设计流程（原 page-design-100-step-flow.ts）─

export type PageDesignFlowStep = {
  step: number
  phase: string
  action: string
  checkpoint: string
}

export type PageDesignFlowPhaseSummary = {
  phase: string
  firstStep: number
  lastStep: number
  stepCount: number
}

function step(
  stepNumber: number,
  phase: string,
  action: string,
  checkpoint: string,
): PageDesignFlowStep {
  return { step: stepNumber, phase, action, checkpoint }
}

export const PAGE_DESIGN_100_STEP_FLOW: readonly PageDesignFlowStep[] = [
  step(1, '入口', '明确用户要的是新页面、局部改造、修 bug、补数据还是调样式', '得到任务类型'),
  step(2, '入口', '定位当前页面 pageId', 'DevSystem 中有 activePageId'),
  step(3, '入口', '判断是否处于 PageDesign live editing 环境', '能解析到 PageDesignEditHost'),
  step(4, '入口', '调用 lifecycle bootstrap', 'nodeTree、dataset、script、style binding 齐全'),
  step(5, '入口', '调用 describeProgress', '确认 phase = editing'),
  step(6, '入口', '识别本次修改的风险级别', '小改、结构改、数据改、跨文件改'),
  step(7, '入口', '明确是否允许新增表和新增组件', '约束 AI 的改动边界'),
  step(8, '入口', '明确是否需要保留现有页面交互', '避免误删已有能力'),
  step(9, '入口', '建立本轮修改日志', '记录后续每个文件的变更原因'),
  step(10, '入口', '确认本轮先不处理表格 UI 细节', '先做数据事实，不先铺 r-table'),
  step(11, '盘点', '读取 pagedata.json 当前模型摘要', '已有表、字段、关系、view、聚合、错误状态可见'),
  step(12, '盘点', '列出所有 DataTable', '表名和业务角色可见'),
  step(13, '盘点', '列出每张表的 columns 和 primaryKey', '字段事实可见'),
  step(14, '盘点', '列出 tableRelations', '现有父子关系可见'),
  step(15, '盘点', '列出 viewDependencies', '显式视图联动可见'),
  step(16, '盘点', '列出每张表的 views', 'default 与业务命名 view 可见'),
  step(17, '盘点', '读取 rule.json 根节点和现有数据绑定', '组件树和绑定列表可见'),
  step(18, '盘点', '收集 rule 中现有 handler 名', '为 script 校验做准备'),
  step(19, '盘点', '读取 script.js', '明确已有 __init__ 和 handle* 函数'),
  step(20, '盘点', '读取 style.css', '明确已有页面 class 和布局规则'),
  step(21, '数据规划', '把用户需求翻译成业务对象', '例如客户、订单、订单明细、状态字典'),
  step(22, '数据规划', '区分主表、子表、引用表、字典表、树节点表', '形成表角色清单'),
  step(23, '数据规划', '确定每个业务对象的稳定表名', '表名大小写与后续 DataViewKey 一致'),
  step(24, '数据规划', '确定每张表的主键字段', '单字段主键优先，多字段交给 _pk 机制'),
  step(25, '数据规划', '规划必要字段和字段类型', '只放业务必要字段，不提前塞 UI 临时状态'),
  step(26, '数据规划', '规划字段 label', '后续表格、表单、详情可复用'),
  step(27, '数据规划', '规划字段必填、范围、正则等校验', '校验沉到 DataColumn'),
  step(28, '数据规划', '规划资源语义', 'resourceType、resourceId、businessCategory 明确'),
  step(29, '数据规划', '判断哪些数据是静态样例', 'resourceType=static-data 才内联 rows'),
  step(30, '数据规划', '判断哪些数据来自远端 API', '后续配置 api.list / CRUD 家族'),
  step(31, '最小表模型', '创建或更新主业务表 columns', '先建最小表结构，不进入表格 UI 设计'),
  step(32, '最小表模型', '创建或更新子表 columns', '子表字段足够支撑关系'),
  step(33, '最小表模型', '创建或更新字典/引用表', '选项不重复塞进主表每一行'),
  step(34, '最小表模型', '给静态表设置基础 rows', '样例数据字段与 columns 对齐'),
  step(35, '最小表模型', '给远端表设置基础 API family', 'list/create/update/delete 按需出现'),
  step(36, '最小表模型', '设置 crudConfig', '超时、提交模式、校验策略明确'),
  step(37, '最小表模型', '避免把 UI 状态写入表结构', '展开态、弹窗态、临时筛选不进 columns'),
  step(38, '最小表模型', '检查表名是否含非法分隔符', '避免破坏 DataViewKey'),
  step(39, '最小表模型', '检查字段名是否稳定', '避免后续 rule/script 频繁跟改'),
  step(40, '最小表模型', '做一次 DataSetCrudTool toJson', '表结构能 canonical 序列化'),
  step(41, '表关系', '先设计 tableRelations', '父表、子表、父字段、子字段明确'),
  step(42, '表关系', '处理多层主从关系', '父子链条能从业务上解释'),
  step(43, '表关系', '处理同一父子表多条关系', '用字段和 relationName 消歧'),
  step(44, '表关系', '校验 parentField 存在', '不出现悬空父字段'),
  step(45, '表关系', '校验 childField 存在', '不出现悬空子字段'),
  step(46, '表关系', '判断是否需要 cascadeUpdate', '只在业务明确要求时设置'),
  step(47, '表关系', '判断是否需要 cascadeDelete', '只在业务明确要求时设置'),
  step(48, '表关系', '暂不急着写 viewDependencies', '先确认后续是否有真实主从级联消费'),
  step(49, '表关系', '检查是否把数据库外键概念误写进配置', '保持 DataSet 页面数据模型口径'),
  step(50, '表关系', '复核表关系对页面是否有真实价值', '没有消费场景的关系先不建'),
  step(51, '页面规划', '规划页面信息架构', '列表、详情、表单、统计、筛选、弹窗、树等区域'),
  step(52, '页面规划', '规划用户操作路径', '新增、编辑、删除、查看、批量、刷新、导入导出'),
  step(53, '页面规划', '明确首屏优先级', '用户打开页面首先看到什么'),
  step(54, '页面规划', '明确主工作区', '主表列表、树、表单还是看板'),
  step(55, '页面规划', '明确辅助区', '详情、统计、日志、说明、筛选等'),
  step(56, '页面规划', '判断哪些区域需要真实数据容器', '避免为装饰区创建无意义 DataView'),
  step(57, '页面规划', '判断哪些区域只是展示静态文本', '这些区域不需要 DataView'),
  step(58, '页面规划', '判断哪些区域需要交互按钮', '后续 rule action / script handler 有据可依'),
  step(59, '页面规划', '判断是否需要弹窗或抽屉', '只在流程需要时新增组件'),
  step(60, '页面规划', '形成页面区域到数据对象的映射草图', '每个区域消费哪张表、是否共享状态清楚'),
  step(61, '数据利用', '为每个区域标注 DataView 消费点', '区域、表名、预期 viewId 草案明确'),
  step(62, '数据利用', '为列表/树区域标注 rows', '容器使用 dataViewKey=Table@view'),
  step(63, '数据利用', '为详情/表单区域标注 currentRow', '来自同一 view 或显式上下文字段'),
  step(64, '数据利用', '为批量操作标注 selectedRows', '多选表格或列表有独立消费点'),
  step(65, '数据利用', '为统计区域标注 aggregateResult', '明确统计依附哪个 DataView'),
  step(66, '数据利用', '为选中统计标注 selectionAggregateResult', '批量选择统计有明确 DataView 来源'),
  step(67, '数据利用', '为字段节点和任意 prop 占位符规划字段消费', 'field 与 $[fieldName] 来自当前 DATA_ROW'),
  step(68, '数据利用', '为选项组件规划 optionDataViewKey', '字典表 view rows 能被复用'),
  step(69, '数据利用', '为按钮和普通组件规划数据作用域', '行内、工具栏、页面级动作区分清楚'),
  step(70, '数据利用', '校验每个数据消费都有真实页面区域', '避免先建没人用的数据出口'),
  step(71, '按需视图', '判断每个消费点是否需要独立 DataView', '以运行态隔离为判断标准'),
  step(72, '按需视图', '为主列表命名主消费 view', '例如 mainList，表达页面意图'),
  step(73, '按需视图', '为独立分页创建 view', '与其他区域分页互不干扰'),
  step(74, '按需视图', '为弹窗选择器创建 view', '选择器过滤和主列表互不干扰'),
  step(75, '按需视图', '为独立筛选面板创建 view', '特殊筛选不污染其他视图'),
  step(76, '按需视图', '为树区域配置 view 元数据', 'treeConfig 按需出现'),
  step(77, '按需视图', '为排序需求配置 sortExpression', '只在该 view 需要稳定排序时写'),
  step(78, '按需视图', '为过滤需求配置 filterExpression', '复杂过滤用结构化表达'),
  step(79, '按需视图', '设置 view 的自动加载策略', 'autoLoad 与首屏行为一致'),
  step(80, '按需视图', '设置 view 的首行策略', 'autoCurrentFirst / autoSelectFirst 与页面行为一致'),
  step(81, '视图依赖', '判断是否需要显式 viewDependencies', '省略会从 tableRelations 自动推导；[] 表示明确禁用'),
  step(82, '视图依赖', '为父子表建依赖', 'parentTable / childTable 与 tableRelations 对齐'),
  step(83, '视图依赖', '判断 dependencyType', 'currentRow、selectedRows、allRows、pagedRows 语义明确'),
  step(84, '视图依赖', '判断子表是否 autoLoad', '只在父状态变化后需要加载时开启'),
  step(85, '视图依赖', '校验依赖对应的表关系存在', '字段绑定由 tableRelations 提供，避免悬空依赖'),
  step(86, '视图依赖', '校验父表和子表的 default view 可用', '当前协议运行时展开到 default view'),
  step(87, '视图依赖', '校验依赖链不会循环', '避免 A 触发 B、B 又触发 A'),
  step(88, '视图依赖', '再次序列化 DataSetCrudTool toJson', 'pagedata.json canonical、可 round-trip'),
  step(89, '结构', '查询组件 payload 列表', '选择合法 r-* 组件'),
  step(90, '结构', '对目标组件调用 guidePayload', '获取 props schema 和使用规则'),
  step(91, '结构', '写入页面节点树', 'rule.json 区域、组件、数据绑定、field 对齐'),
  step(92, '结构', '为需要脚本访问的组件设置稳定 id', '$components.getApi(id) 有真实目标'),
  step(93, '行为', '对照 rule 中 handlers 生成函数清单', '缺失函数列表明确'),
  step(94, '行为', '补 __init__ 和事件函数', '$dataSet.getView(table, view) 读写 DataView'),
  step(95, '行为', '替换或补全 script.js 全文', '不使用 forbidden $page 伪 API'),
  step(96, '样式', '从 rule 收集 class 并补 style.css', '选择器与 rule class 对齐'),
  step(97, '交叉校验', '校验数据绑定、field、relation、dependency', '表、字段、view、关系全部闭合'),
  step(98, '交叉校验', '校验 handler、component id、class', 'rule/script/style 互相闭合'),
  step(99, '预览修正', '触发 DevPreviewTab 或页面渲染并回补错误', '解析、渲染、自动加载、主从联动正常'),
  step(100, '收尾', '总结修改与剩余风险', '用户知道改了哪些文件、如何验证'),
]

export function getPageDesignFlowStep(stepNumber: number): PageDesignFlowStep | null {
  return PAGE_DESIGN_100_STEP_FLOW.find((item) => item.step === stepNumber) ?? null
}

export function listPageDesignFlowSteps(phase?: string): readonly PageDesignFlowStep[] {
  if (phase === undefined || phase.trim() === '') return PAGE_DESIGN_100_STEP_FLOW
  return PAGE_DESIGN_100_STEP_FLOW.filter((item) => item.phase === phase)
}

export function summarizePageDesignFlowPhases(): PageDesignFlowPhaseSummary[] {
  const summaries = new Map<string, PageDesignFlowPhaseSummary>()
  for (const item of PAGE_DESIGN_100_STEP_FLOW) {
    const existing = summaries.get(item.phase)
    if (existing === undefined) {
      summaries.set(item.phase, {
        phase: item.phase,
        firstStep: item.step,
        lastStep: item.step,
        stepCount: 1,
      })
    } else {
      existing.lastStep = item.step
      existing.stepCount += 1
    }
  }
  return [...summaries.values()]
}

export function getNextPageDesignFlowStep(completedStep: number): PageDesignFlowStep | null {
  return getPageDesignFlowStep(completedStep + 1)
}

// ── SECTION 6: DataSet 设计器投影（原 page-design-designer-projection.ts）

import type { DataColumn, DataSetMetadata, TableMetadata, TableRelation } from '@spark-view/spark-data'

export type DesignerColumnProjection = DataColumn & {
  id: string
}

export type DesignerTableProjection = Omit<TableMetadata, 'columns'> & {
  id: string
  x: number
  y: number
  columns: DesignerColumnProjection[]
}

export type DesignerRelationProjection = TableRelation & {
  relationType?: 'one-to-many' | 'one-to-one' | 'many-to-many'
}

export type DesignerTableUiState = {
  id: string
  x: number
  y: number
  columnIds: Record<string, string>
}

type LayoutForNewTable = (tableName: string, newIndex: number) => { x: number; y: number }

function getDefaultTablePosition(index: number): { x: number; y: number } {
  return {
    x: 50 + (index % 3) * 220,
    y: 50 + Math.floor(index / 3) * 200,
  }
}

export function reconcileDesignerTableUiState(
  metadata: DataSetMetadata,
  currentTables: ReadonlyArray<Pick<DesignerTableProjection, 'tableName' | 'id' | 'x' | 'y' | 'columns'>>,
  createId: () => string,
  layoutForNewTable?: LayoutForNewTable,
): Record<string, DesignerTableUiState> {
  const oldByName = new Map(currentTables.map(table => [table.tableName, table]))
  const persistedPositions = metadata.layout?.tablePositions
  const nextUiState: Record<string, DesignerTableUiState> = {}
  let newTableCount = 0

  Object.entries(metadata.tables).forEach(([tableName, tableConfig], idx) => {
    const oldTable = oldByName.get(tableName)
    const oldColumnIdMap = new Map((oldTable?.columns ?? []).map(col => [col.name, col.id]))
    const defaultLayout = getDefaultTablePosition(idx)
    const newLayout = layoutForNewTable?.(tableName, newTableCount) ?? defaultLayout
    const persistedLayout = persistedPositions?.[tableName]
    if (!oldTable) newTableCount += 1

    nextUiState[tableName] = {
      id: oldTable?.id ?? createId(),
      x: persistedLayout?.x ?? oldTable?.x ?? newLayout.x,
      y: persistedLayout?.y ?? oldTable?.y ?? newLayout.y,
      columnIds: Object.fromEntries(
        tableConfig.columns.map((column) => [column.name, oldColumnIdMap.get(column.name) ?? createId()]),
      ),
    }
  })

  return nextUiState
}

export function projectDesignerTables(
  metadata: DataSetMetadata,
  tableUiState: Record<string, DesignerTableUiState>,
  createId: () => string,
): DesignerTableProjection[] {
  return Object.entries(metadata.tables).map(([tableName, tableConfig], idx) => {
    const uiState = tableUiState[tableName]
    const persistedLayout = metadata.layout?.tablePositions?.[tableName]
    const defaultLayout = getDefaultTablePosition(idx)
    const columnIds = uiState?.columnIds ?? {}

    return {
      id: uiState?.id ?? createId(),
      x: uiState?.x ?? persistedLayout?.x ?? defaultLayout.x,
      y: uiState?.y ?? persistedLayout?.y ?? defaultLayout.y,
      ...tableConfig,
      columns: tableConfig.columns.map((column) => ({
        id: columnIds[column.name] ?? createId(),
        ...column,
      })),
    }
  })
}

export function projectDesignerRelations(metadata: DataSetMetadata): DesignerRelationProjection[] {
  return (metadata.tableRelations ?? []).map((rel) => ({
    ...rel,
    relationType: 'one-to-many',
  }))
}

export function buildDataSetMetadataFromDesignerProjection(params: {
  dataSetName: string
  tables: readonly DesignerTableProjection[]
  relations: readonly DesignerRelationProjection[]
  viewDependencies?: NonNullable<DataSetMetadata['viewDependencies']>
}): DataSetMetadata {
  const tablesObj: Record<string, TableMetadata> = {}
  const tablePositions: Record<string, { x: number; y: number }> = {}

  for (const table of params.tables) {
    const { id: _id, x: _x, y: _y, columns: designerCols, ...tableRest } = table
    const columns: DataColumn[] = designerCols.map(({ id: _cid, ...col }) => col)
    tablesObj[table.tableName] = { ...tableRest, columns }
    tablePositions[table.tableName] = { x: table.x, y: table.y }
  }

  return {
    dataSetName: params.dataSetName,
    tables: tablesObj,
    tableRelations: params.relations.map((rel) => ({
      parentTable: rel.parentTable,
      childTable: rel.childTable,
      ...(rel.parentField !== undefined ? { parentField: rel.parentField } : {}),
      ...(rel.childField !== undefined ? { childField: rel.childField } : {}),
      ...(rel.relationName !== undefined ? { relationName: rel.relationName } : {}),
      ...(rel.condition !== undefined ? { condition: rel.condition } : {}),
      ...(rel.cascadeUpdate !== undefined ? { cascadeUpdate: rel.cascadeUpdate } : {}),
      ...(rel.cascadeDelete !== undefined ? { cascadeDelete: rel.cascadeDelete } : {}),
    })),
    ...(params.viewDependencies !== undefined ? { viewDependencies: params.viewDependencies } : {}),
    layout: { tablePositions },
  }
}

export function hasDesignerProjectionChanges(current: DataSetMetadata, persisted: DataSetMetadata | null): boolean {
  if (!persisted) {
    return Object.keys(current.tables).length > 0 || (current.tableRelations?.length ?? 0) > 0
  }

  if (current === persisted) return false

  return !isEqualComparableMetadata(
    normalizeDesignerComparableMetadata(current),
    normalizeDesignerComparableMetadata(persisted),
  )
}

function isEqualComparableMetadata(a: DataSetMetadata, b: DataSetMetadata): boolean {
  if (a.dataSetName !== b.dataSetName) return false

  const aTableKeys = Object.keys(a.tables)
  const bTableKeys = Object.keys(b.tables)
  if (aTableKeys.length !== bTableKeys.length) return false
  for (const key of aTableKeys) {
    const at = a.tables[key]
    const bt = b.tables[key]
    if (!at || !bt) return false
    if (!isEqualTableMetadata(at, bt)) return false
  }

  const aRels = a.tableRelations ?? []
  const bRels = b.tableRelations ?? []
  if (aRels.length !== bRels.length) return false
  for (let i = 0; i < aRels.length; i++) {
    const ar = aRels[i]
    const br = bRels[i]
    if (!ar || !br) return false
    if (!isEqualRelation(ar, br)) return false
  }

  if (!isEqualViewDeps(a.viewDependencies, b.viewDependencies)) return false

  const aPos = a.layout?.tablePositions
  const bPos = b.layout?.tablePositions
  if (aPos && bPos) {
    const aKeys = Object.keys(aPos)
    const bKeys = Object.keys(bPos)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      const ap = aPos[key]
      const bp = bPos[key]
      if (ap?.x !== bp?.x || ap?.y !== bp?.y) return false
    }
  } else if (aPos !== bPos) {
    return false
  }

  return true
}

function isEqualTableMetadata(a: TableMetadata, b: TableMetadata): boolean {
  if (a.tableName !== b.tableName) return false
  if (a.resourceType !== b.resourceType) return false
  if (a.resourceId !== b.resourceId) return false
  if (a.businessCategory !== b.businessCategory) return false

  const aCols = a.columns
  const bCols = b.columns
  if (aCols.length !== bCols.length) return false
  for (let i = 0; i < aCols.length; i++) {
    const ac = aCols[i]
    const bc = bCols[i]
    if (!ac || !bc) return false
    if (!isEqualColumn(ac, bc)) return false
  }

  if (!isEqualObject(a.api, b.api)) return false
  if (!isEqualObject(a.views, b.views)) return false

  return true
}

function isEqualColumn(a: DataColumn, b: DataColumn): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.label === b.label &&
    a.allowDBNull === b.allowDBNull &&
    a.isPrimaryKey === b.isPrimaryKey &&
    isEqualObject(a.defaultValue, b.defaultValue)
  )
}

function isEqualRelation(a: TableRelation, b: TableRelation): boolean {
  return (
    a.parentTable === b.parentTable &&
    a.childTable === b.childTable &&
    a.parentField === b.parentField &&
    a.childField === b.childField &&
    a.relationName === b.relationName &&
    a.condition === b.condition &&
    a.cascadeUpdate === b.cascadeUpdate &&
    a.cascadeDelete === b.cascadeDelete
  )
}

function isViewDepArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value)
}

function isEqualViewDeps(
  a: DataSetMetadata['viewDependencies'],
  b: DataSetMetadata['viewDependencies'],
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (!isViewDepArray(a) || !isViewDepArray(b)) return false
  return isEqualArray(a, b)
}

function getObjectEntries(value: object): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = []
  for (const key of Object.keys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key)
    if (desc) entries.push([key, desc.value])
  }
  return entries
}

function isEqualObject(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return isEqualArray(a, b)
  const aEntries = getObjectEntries(a)
  const bEntries = getObjectEntries(b)
  if (aEntries.length !== bEntries.length) return false
  const bMap = new Map(bEntries)
  for (const [key, aVal] of aEntries) {
    if (!bMap.has(key) || !isEqualObject(aVal, bMap.get(key))) return false
  }
  return true
}

function isEqualArray(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!isEqualObject(a[i], b[i])) return false
  }
  return true
}

function normalizeDesignerComparableMetadata(metadata: DataSetMetadata): DataSetMetadata {
  const { pageId: _pageId, ...rest } = metadata
  const tableEntries = Object.entries(metadata.tables)
  const tablePositions = Object.fromEntries(
    tableEntries.map(([tableName], index) => [
      tableName,
      metadata.layout?.tablePositions?.[tableName] ?? getDefaultTablePosition(index),
    ]),
  )

  return {
    ...rest,
    tableRelations: metadata.tableRelations ?? [],
    ...(tableEntries.length > 0
      ? {
          layout: {
            ...(metadata.layout ?? {}),
            tablePositions,
          },
        }
      : {}),
  }
}
