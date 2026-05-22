/**
 * 规则编辑器工件：组件元数据、规则树策略、规则 JSON Schema。
 */

import type { JsonObject, JsonValue } from '../../json-document'

// ── SECTION 1: 规则编辑器组件元数据 ──

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

// ── SECTION 2: 规则树编辑策略 ──

import type { AutoPopulateEntry, JsonPath, JsonTreePolicy } from '../../json-document'
import { ensureUniqueObjectKey, isRecord } from '../../json-document'

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

// ── SECTION 3: 规则 JSON Schema ──

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

