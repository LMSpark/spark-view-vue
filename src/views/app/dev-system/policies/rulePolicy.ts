// ══════════════════════════════════════════════════════════════
// rulePolicy.ts — rule.json (SparkNode) 领域策略
// ══════════════════════════════════════════════════════════════

import type { JsonObject, JsonPath, JsonTreePolicy, JsonValue } from '../jsonTreeEditor'
import { ensureUniqueObjectKey } from '../jsonTreeEditor'

// ── SparkNode 结构键 ─────────────────────────────────────────
//
// SparkNode = { type, props?, children?, id? }
// - 根级只有这 4 个结构键
// - props 是 object
// - children 是 array（内含 SparkNode | string | number）
// - 嵌套无限深

const SPARK_NODE_STRUCT_KEYS = new Set(['type', 'props', 'children', 'id'])

/**
 * 判断路径是否指向一个 SparkNode 的根级位置。
 * 根 $ 是 SparkNode，children[N] 也是 SparkNode。
 */
function isSparkNodeRoot(path: JsonPath): boolean {
  if (path.length === 0) return true
  // $.children[0], $.children[0].children[1], ...
  // 模式：最后两段是 'children' + number
  const last = path[path.length - 1]
  const prev = path[path.length - 2]
  return typeof last === 'number' && prev === 'children'
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

  // 在 props 内添加
  if (isPropsObject(parentPath)) {
    const preferredProps = ['dataKey', 'field', 'label', 'visible', 'disabled']
    for (const key of preferredProps) {
      if (!(key in target)) return key
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

// ── 导出策略对象 ──────────────────────────────────────────────

export const rulePolicy: JsonTreePolicy = {
  rootLabel: 'rule',
  isProtected,
  canEditKey,
  canEditType,
  suggestChildKey,
  createDefaultArrayItem,
  createDefaultObjectValue,
}
