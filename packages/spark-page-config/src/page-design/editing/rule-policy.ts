import type { AutoPopulateEntry, JsonObject, JsonPath, JsonTreePolicy, JsonValue } from '../../json-document'
import { ensureUniqueObjectKey } from '../../json-document'
import {
  EMPTY_RULE_EDITOR_COMPONENT_METADATA,
  type RuleEditorComponentMetadata,
} from './rule-editor-metadata'

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
    const typeValue = sparkNode !== undefined ? (sparkNode as Record<string, unknown>)['type'] : undefined
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
  metadata: RuleEditorComponentMetadata = EMPTY_RULE_EDITOR_COMPONENT_METADATA,
): JsonTreePolicy {
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
        propsEntries[name] = value as JsonValue
      }

      return [{
        targetPath: changedPath.slice(0, -1),
        entries: { props: propsEntries as JsonValue },
      }]
    },
  }
}
