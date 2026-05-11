// ══════════════════════════════════════════════════════════════
// rulePolicy.ts — rule.json (SparkNode) 领域策略
// ══════════════════════════════════════════════════════════════

import type { JsonObject, JsonPath, JsonTreePolicy, JsonValue } from '@spark-view/spark-component'
import type { AutoPopulateEntry } from '@spark-view/spark-component'
import { ensureUniqueObjectKey } from '@spark-view/spark-component'
import { DEV_PROP_NAMES, DEV_PROP_ENUMS, DEV_TYPE_LABELS, DEV_REQUIRED_PROPS } from './devComponentMetadata'

// ── SparkNode 结构键 ─────────────────────────────────────────
//
// SparkNode = { type, props?, children?, id? }
// - 根级只有这 4 个结构键
// - props 是 object
// - children 是 array（内含 SparkNode | string | number）
// - 嵌套无限深

const SPARK_NODE_STRUCT_KEYS = new Set(['type', 'props', 'children'])

/**
 * 判断路径是否指向一个 SparkNode 的根级位置。
 * rule.json 顶层是 SparkNode 数组，因此：
 * - [] → SparkNode（当根文档本身是单节点时）
 * - [N] → SparkNode（根级数组项）
 * - [..., 'children', N] → SparkNode（嵌套子节点）
 */
function isSparkNodeRoot(path: JsonPath): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  if (typeof last !== 'number') return false
  // 根级数组项：path = [N]
  if (path.length === 1) return true
  // 嵌套：最后两段是 'children' + number
  const prev = path[path.length - 2]
  return prev === 'children'
}

/**
 * 判断路径是否指向 SparkNode 的 type 字段。
 * 包括 $.type, $.children[0].type, $.children[0].children[1].type 等。
 */
function isTypeField(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'type') return false
  const parentPath = path.slice(0, -1)
  return isSparkNodeRoot(parentPath)
}

/**
 * 判断路径是否指向 SparkNode 的 children 数组。
 */
function isChildrenArray(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'children') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

/**
 * 判断路径是否指向 SparkNode 的 props 对象。
 */
function isPropsObject(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'props') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

// ── 策略实现 ─────────────────────────────────────────────────

// h(type, props, children) — type 可以是组件也可以是 HTML 元素
// 常用 HTML 元素 + 目录缺失标签的组件（统一 [中文] type 格式）
const EXTRA_TYPE_LABELS: Record<string, string> = {
  // ── HTML 元素 ──
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
  // ── 目录中缺少中文标签的组件 ──
  'nav-icon': '[导航图标] nav-icon',
  'module-context-badge': '[模块徽章] module-context-badge',
  'icon-picker': '[图标选择器] icon-picker',
  'error-fallback': '[错误回退] error-fallback',
  'spark-json-editor': '[JSON编辑器] spark-json-editor',
  'json-tree-editor': '[JSON树编辑器] json-tree-editor',
  'r-column-group': '[分组列] r-column-group',
}

// 预计算 type 下拉选项（带中文标签），惰性缓存
let _typeLabelsCache: Array<{ label: string; value: string }> | null = null
function getTypeLabelOptions(): Array<{ label: string; value: string }> {
  if (_typeLabelsCache !== null) return _typeLabelsCache
  // 合并：EXTRA 补齐在前（HTML + 缺标签组件），组件目录覆盖在后
  const merged = { ...EXTRA_TYPE_LABELS, ...DEV_TYPE_LABELS }
  _typeLabelsCache = Object.entries(merged)
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.value.localeCompare(b.value))
  return _typeLabelsCache
}

function isProtected(path: JsonPath): boolean {
  // type 字段不可删（SparkNode 必须有 type）
  if (isTypeField(path)) return true
  // children 和 props 结构键不可删（但内容可改）
  if (isChildrenArray(path)) return true
  if (isPropsObject(path)) return true
  return false
}

function canEditKey(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]

  // SparkNode 结构键不可改名
  if (typeof last === 'string' && SPARK_NODE_STRUCT_KEYS.has(last)) {
    const parentPath = path.slice(0, -1)
    if (isSparkNodeRoot(parentPath)) return false
  }

  // props 内的属性名可以改
  // 数组索引不可改
  return typeof last === 'string'
}

function canEditType(path: JsonPath): boolean {
  if (path.length === 0) return false
  // type 字段的值只能是字符串（通过值编辑改，不通过类型切换）
  if (isTypeField(path)) return false
  // SparkNode 本身的类型（object）不可切换
  if (isSparkNodeRoot(path)) return false
  // children 是数组不可切换
  if (isChildrenArray(path)) return false
  // props 是对象不可切换
  if (isPropsObject(path)) return false
  // 其余 props 内的值可以切换类型
  return true
}

function suggestChildKey(target: JsonObject, parentPath: JsonPath): string {
  // 在 SparkNode 根级添加子键
  if (isSparkNodeRoot(parentPath)) {
    // 优先建议 props（如果没有的话）
    const preferredKeys = ['props', 'children', 'id']
    for (const key of preferredKeys) {
      if (!(key in target)) return key
    }
    return ensureUniqueObjectKey(target, 'custom')
  }

  // 在 props 内添加 — 基于组件类型建议已知属性
  if (isPropsObject(parentPath)) {
    // 优先建议通用高频属性
    const preferredProps = ['dataKey', 'field', 'label', 'visible', 'disabled']
    for (const key of preferredProps) {
      if (!(key in target)) return key
    }
    // 从 catalog 补充该组件类型的专属属性
    const sparkNode = parentPath.length >= 2 ? undefined : target
    const typeValue = sparkNode !== undefined ? (sparkNode as Record<string, unknown>)['type'] : undefined
    if (typeof typeValue === 'string' && DEV_PROP_NAMES[typeValue] !== undefined) {
      for (const key of DEV_PROP_NAMES[typeValue]) {
        if (!(key in target)) return key
      }
    }
    return ensureUniqueObjectKey(target, 'newProp')
  }

  return ensureUniqueObjectKey(target, 'newKey')
}

function createDefaultArrayItem(parentPath: JsonPath): JsonValue {
  // children 数组 → 新 SparkNode
  if (isChildrenArray(parentPath)) {
    return { type: 'div' }
  }
  // 其他数组 → 空字符串
  return ''
}

function createDefaultObjectValue(parentPath: JsonPath, key: string): JsonValue {
  // SparkNode 根级新增
  if (isSparkNodeRoot(parentPath)) {
    if (key === 'props') return {}
    if (key === 'children') return []
    if (key === 'id') return ''
    return ''
  }
  // props 内属性默认值
  if (isPropsObject(parentPath)) {
    if (key === 'visible' || key === 'disabled') return false
    if (key === 'on') return {}
    return ''
  }
  return ''
}

/**
 * 判断路径是否指向 props 内的某个属性值。
 * 模式：...[SparkNodeRoot].props.{propName}
 */
function isPropsChildValue(path: JsonPath): { propName: string } | null {
  if (path.length < 2) return null
  const last = path[path.length - 1]
  if (typeof last !== 'string') return null
  const parentPath = path.slice(0, -1)
  if (isPropsObject(parentPath)) return { propName: last }
  return null
}

// ── 导出策略对象 ──────────────────────────────────────────────

export const rulePolicy: JsonTreePolicy = {
  rootLabel: 'rule',
  isProtected,
  canEditKey,
  canEditType,
  suggestChildKey,
  createDefaultArrayItem,
  createDefaultObjectValue,
  getValueOptions(path: JsonPath): string[] | undefined {
    // props 内的属性值 — 如果 catalog 有枚举定义则返回
    const propInfo = isPropsChildValue(path)
    if (propInfo === null) return undefined
    // 遍历所有组件类型的该属性枚举，合并去重
    const merged = new Set<string>()
    for (const typeEnums of Object.values(DEV_PROP_ENUMS)) {
      const vals = typeEnums[propInfo.propName]
      if (vals !== undefined) {
        for (const v of vals) merged.add(v)
      }
    }
    return merged.size > 0 ? [...merged] : undefined
  },
  getValueLabels(path: JsonPath): Array<{ label: string; value: string }> | undefined {
    if (isTypeField(path)) return getTypeLabelOptions()
    return undefined
  },
  getAutoPopulate(changedPath: JsonPath, newValue: JsonValue): AutoPopulateEntry[] | undefined {
    // 仅在 type 字段变更时触发
    if (!isTypeField(changedPath) || typeof newValue !== 'string') return undefined
    const componentType = newValue
    // 目标是 type 字段所在的 SparkNode 对象
    const sparkNodePath = changedPath.slice(0, -1)

    // 始终确保 props 存在
    const propsEntries: Record<string, JsonValue> = {}

    // 注入必填属性默认值
    const requiredProps = DEV_REQUIRED_PROPS[componentType]
    if (requiredProps !== undefined) {
      for (const [name, value] of Object.entries(requiredProps)) {
        propsEntries[name] = value as JsonValue
      }
    }

    return [{
      targetPath: sparkNodePath,
      entries: { props: propsEntries as JsonValue },
    }]
  },
}
