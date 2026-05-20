// ══════════════════════════════════════════════════════════════
// json-document.ts — 通用 JSON 文档编辑核心
//
// 设计原则：
//   - UUID 稳定标识：每个节点有唯一 id，数组增删不影响其他节点身份
//   - 内部树模型：TreeModel（Map<id, TreeNode>）为唯一可变状态
//   - 平坦行输出：toDisplayRows() 直供 VXE treeConfig.transform = true
//   - 导出即转换：exportJsonDocument() 从 TreeModel 重建 JSON
//   - 策略注入：领域特化逻辑通过 JsonTreePolicy 外部提供
//   - 不可变变更：所有 mutation 返回新 TreeModel，不修改原模型
// ══════════════════════════════════════════════════════════════

export { resolveSchemaInfoForPath } from './json-schema-info'

// ── 基础 JSON 类型 ──────────────────────────────────────────

type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  [key: string]: JsonValue
}

/** 文档顶层：对象或数组 */
export type JsonDocument = JsonObject | JsonValue[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 将未知值安全收窄为 JsonValue；不符合时返回 null */
function asJsonValue(value: unknown): JsonValue | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    const items: JsonValue[] = []
    for (const item of value) {
      const narrowed = asJsonValue(item)
      if (narrowed === null && item !== null) return null
      items.push(narrowed ?? null)
    }
    return items
  }
  if (isRecord(value)) {
    const obj: JsonObject = {}
    for (const [k, v] of Object.entries(value)) {
      const narrowed = asJsonValue(v)
      if (narrowed === null && v !== null) return null
      obj[k] = narrowed ?? null
    }
    return obj
  }
  return null
}

/** 已知非容器值收窄为原始类型 */
function toPrimitive(value: JsonValue): JsonPrimitive {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return null
}

function objectKeyFromSegment(segment: JsonPathSegment): string {
  return typeof segment === 'string' ? segment : String(segment)
}

// ── 路径类型 ────────────────────────────────────────────────

export type JsonPathSegment = string | number
export type JsonPath = JsonPathSegment[]

// ── 节点类型 ────────────────────────────────────────────────

export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

// ── Schema 信息 ──────────────────────────────────────────────

export interface JsonSchemaInfo {
  title: string
  description: string
  required: boolean
  enumValues: string[]
}

// ── Mutation 结果（模型 + 焦点/展开 UID）────────────────────

export interface MutationResult {
  /** 变更后的新树模型 */
  readonly model: TreeModel
  /** 操作后应聚焦的节点 ID */
  readonly focusId: string
  /** 操作后应展开的节点 ID（null 表示无需展开） */
  readonly expandId: string | null
}

// ── 树节点（纯模型，6 字段）─────────────────────────────────

export interface TreeNode {
  /** 节点 UUID */
  readonly id: string
  /** 父节点 ID；根节点为 null */
  readonly parentId: string | null
  /** 在父容器中的键 (string) 或索引 (number) */
  readonly segment: string | number
  /** 节点类型 */
  readonly type: JsonNodeType
  /** 叶子节点的原始值 */
  readonly value: string | number | boolean | null
  /** 同级排序权重（parentId 相同的节点按此排序） */
  readonly order: number
}

// ── 显示行（toDisplayRows 输出，附加遍历上下文 + 策略字段）──

export interface TreeDisplayNode extends TreeNode {
  /** 嵌套深度（根 = 0） */
  readonly depth: number
  /** 从根到此节点的路径 */
  readonly path: JsonPath
  /** 直接子节点数量 */
  readonly childCount: number
  /** 键是否可重命名 */
  readonly keyEditable: boolean
  /** 类型是否可切换 */
  readonly typeEditable: boolean
  /** 是否可删除 */
  readonly deletable: boolean
}

export type TreeModel = ReadonlyMap<string, TreeNode>

/** 查找根节点 ID（parentId === null 的唯一节点） */
export function rootOf(model: TreeModel): string {
  for (const [id, node] of model) {
    if (node.parentId === null) return id
  }
  throw new Error('TreeModel has no root node')
}

/** 基于 crypto.randomUUID 的 UID 生成器，消除全局计数器冲突风险 */
function generateUid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** 按 order 排序返回某父节点的所有子节点 ID */
function getChildIds(model: ReadonlyMap<string, TreeNode>, parentId: string): string[] {
  const children: Array<{ id: string; order: number }> = []
  for (const node of model.values()) {
    if (node.parentId === parentId) children.push({ id: node.id, order: node.order })
  }
  children.sort((a, b) => a.order - b.order)
  return children.map(c => c.id)
}

// ── 策略接口（领域特化注入点）────────────────────────────────

export interface JsonTreePolicy {
  /** 根节点显示标签。默认 '$' */
  rootLabel?: string
  /** 该路径是否受保护（不可删除）。默认全部可删除 */
  isProtected?(path: JsonPath): boolean
  /** 该路径的键是否可重命名。默认：对象属性可改，数组索引不可改 */
  canEditKey?(path: JsonPath): boolean
  /** 该路径的类型是否可切换。默认：除根节点外均可 */
  canEditType?(path: JsonPath): boolean
  /** 为目标对象建议新子键名 */
  suggestChildKey?(target: JsonObject, parentPath: JsonPath): string
  /** 为数组添加子项时的默认值 */
  createDefaultArrayItem?(parentPath: JsonPath): JsonValue
  /** 为对象添加子项时的默认值 */
  createDefaultObjectValue?(parentPath: JsonPath, key: string): JsonValue
  /** 返回该路径的可选值列表（用于下拉选择，优先级低于 Schema enum） */
  getValueOptions?(path: JsonPath): string[] | undefined
  /** 返回该路径的带标签下拉选项。优先级最高：getValueLabels > Schema enum > getValueOptions */
  getValueLabels?(path: JsonPath): Array<{ label: string; value: string }> | undefined
  /** 值变更后需要自动填充到文档的补丁。返回的条目中已有的键不会被覆盖 */
  getAutoPopulate?(changedPath: JsonPath, newValue: JsonValue): AutoPopulateEntry[] | undefined
}

/**
 * 自动填充条目：在 targetPath 指向的对象上合并 entries 键值对。
 * - 若 targetPath 处不是 object，跳过
 * - 若某 key 已存在且新旧值都是 object，递归一层合并（仅补缺）
 * - 若某 key 已存在且不都是 object，跳过（不覆盖）
 */
export interface AutoPopulateEntry {
  targetPath: JsonPath
  entries: Record<string, JsonValue>
}

// ════════════════════════════════════════════════════════════
// 路径格式化
// ════════════════════════════════════════════════════════════

const SIMPLE_KEY_PATTERN = /^[A-Za-z_$][\w$]*$/

/**
 * 将路径段数组格式化为 JSONPath 风格字符串。
 *
 * 空路径 → `$`；简单键 → `.key`；数字索引 → `[0]`；特殊键 → `["key"]`
 */
export function formatJsonPath(path: JsonPath): string {
  if (path.length === 0) return '$'
  let text = '$'
  for (const segment of path) {
    if (typeof segment === 'number') {
      text += `[${segment}]`
    } else if (SIMPLE_KEY_PATTERN.test(segment)) {
      text += `.${segment}`
    } else {
      text += `[${JSON.stringify(segment)}]`
    }
  }
  return text
}

// ════════════════════════════════════════════════════════════
// 解析 / 序列化
// ════════════════════════════════════════════════════════════

export function parseJsonDocument(rawText: string): JsonDocument {
  const parsed: unknown = JSON.parse(rawText)
  return normalizeJsonDocument(parsed)
}

export function serializeJsonDocument(value: JsonDocument): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * 归一化任意值为 JsonDocument（顶层仅允许对象或数组）。
 */
export function normalizeJsonDocument(value: unknown): JsonDocument {
  const narrowed = asJsonValue(value)
  if (narrowed === null) throw new Error('JSON 顶层必须是对象或数组')
  if (Array.isArray(narrowed) || isJsonObject(narrowed)) return narrowed
  throw new Error('JSON 顶层必须是对象或数组')
}

// ════════════════════════════════════════════════════════════
// TreeModel 构建 / 导出 / 显示行
// ════════════════════════════════════════════════════════════

/** 将 JsonValue 子树递归写入 mutable nodes Map，返回节点 id */
function addNodeToMap(
  nodes: Map<string, TreeNode>,
  value: JsonValue,
  parentId: string | null,
  segment: string | number,
  order: number,
): string {
  const id = generateUid()
  const type = inferNodeType(value)
  const isContainer = type === 'object' || type === 'array'

  nodes.set(id, {
    id, parentId, segment, type,
    value: isContainer ? null : toPrimitive(value),
    order,
  })

  if (isContainer && Array.isArray(value)) {
    value.forEach((item, i) => addNodeToMap(nodes, item, id, i, i))
  } else if (isContainer && isJsonObject(value)) {
    let idx = 0
    for (const [k, v] of Object.entries(value))
      addNodeToMap(nodes, v, id, k, idx++)
  }

  return id
}

/** 将节点子树递归序列化回 JsonValue */
function toJsonValue(nodes: ReadonlyMap<string, TreeNode>, uid: string): JsonValue {
  const n = nodes.get(uid)
  if (!n) throw new Error(`toJsonValue: node "${uid}" not found`)
  const children = getChildIds(nodes, uid)
  if (n.type === 'array') return children.map(c => toJsonValue(nodes, c))
  if (n.type === 'object') {
    const obj: JsonObject = {}
    for (const c of children) {
      const ch = nodes.get(c)
      if (ch) obj[objectKeyFromSegment(ch.segment)] = toJsonValue(nodes, c)
    }
    return obj
  }
  return n.value
}

/** 从 JSON 文档构建内部树模型 */
export function buildTreeModel(doc: JsonDocument, policy?: Partial<JsonTreePolicy>): TreeModel {
  const nodes = new Map<string, TreeNode>()
  addNodeToMap(nodes, doc, null, resolvePolicy(policy).rootLabel, 0)
  return nodes
}

/** 从 TreeModel 重建 JSON 文档 */
export function exportJsonDocument(model: TreeModel): JsonDocument {
  const value = toJsonValue(model, rootOf(model))
  if (Array.isArray(value) || isJsonObject(value)) return value
  throw new Error('文档根节点必须是对象或数组')
}

/** 从根到目标节点重建 JsonPath */
export function getNodePath(model: TreeModel, uid: string): JsonPath {
  const segments: JsonPathSegment[] = []
  let current = model.get(uid)
  while (current?.parentId !== undefined && current.parentId !== null) {
    segments.unshift(current.segment)
    current = model.get(current.parentId)
  }
  return segments
}

/** 将 TreeModel 展开为平坦行数组（深度优先序） */
export function toDisplayRows(model: TreeModel, policy?: Partial<JsonTreePolicy>): TreeDisplayNode[] {
  const p = resolvePolicy(policy)
  const rows: TreeDisplayNode[] = []

  function walk(uid: string, depth: number, path: JsonPath): void {
    const node = model.get(uid)
    if (!node) return
    const children = getChildIds(model, uid)
    rows.push({
      ...node, depth, path,
      childCount: children.length,
      keyEditable: p.canEditKey(path),
      typeEditable: p.canEditType(path),
      deletable: depth > 0 && !p.isProtected(path),
    })
    for (const childId of children) {
      const ch = model.get(childId)
      if (ch) walk(childId, depth + 1, [...path, ch.segment])
    }
  }

  walk(rootOf(model), 0, [])
  return rows
}

/**
 * 便捷入口：直接将对象/数组文档展开为平坦树行。
 */
export function buildJsonTreeRows(doc: JsonDocument, policy?: Partial<JsonTreePolicy>): TreeDisplayNode[] {
  return toDisplayRows(buildTreeModel(doc, policy), policy)
}

// ════════════════════════════════════════════════════════════
// 过滤（保留命中行的所有祖先）
// ════════════════════════════════════════════════════════════

export function filterTreeNodes<T extends Pick<TreeNode, 'id' | 'parentId'>>(
  rows: T[],
  predicate: (row: T) => boolean,
): T[] {
  const parentMap = new Map<string, string | null>()
  for (const row of rows) {
    parentMap.set(row.id, row.parentId)
  }

  const matchedIds = new Set<string>()
  for (const row of rows) {
    if (!predicate(row)) continue
    let currentId: string | null = row.id
    while (currentId !== null && !matchedIds.has(currentId)) {
      matchedIds.add(currentId)
      currentId = parentMap.get(currentId) ?? null
    }
  }

  return rows.filter((r) => matchedIds.has(r.id))
}

// ════════════════════════════════════════════════════════════
// 变更操作（纯函数，不可变，基于 TreeModel）
// ════════════════════════════════════════════════════════════

function unchanged(model: TreeModel, uid: string): MutationResult {
  return { model, focusId: uid, expandId: null }
}

function makeResult(nodes: Map<string, TreeNode>, focusId: string, expandId: string | null = null): MutationResult {
  return { model: nodes, focusId, expandId }
}

/** 递归移除子树 */
function removeSubtree(nodes: Map<string, TreeNode>, uid: string): void {
  const n = nodes.get(uid)
  if (!n) return
  for (const c of getChildIds(nodes, uid)) removeSubtree(nodes, c)
  nodes.delete(uid)
}

/** 修正数组子节点的 segment 和 order（插入/删除后） */
function reindexChildren(nodes: Map<string, TreeNode>, parentId: string): void {
  const children = getChildIds(nodes, parentId)
  for (let i = 0; i < children.length; i++) {
    const cid = children[i]
    if (!cid) continue
    const c = nodes.get(cid)
    if (c && (c.segment !== i || c.order !== i)) {
      nodes.set(c.id, { ...c, segment: i, order: i })
    }
  }
}

/** 收集父节点下所有字符串键（供 suggestChildKey 判重） */
function collectSiblingKeys(model: TreeModel, parentId: string): JsonObject {
  const obj: JsonObject = {}
  for (const c of getChildIds(model, parentId)) {
    const ch = model.get(c)
    if (ch && typeof ch.segment === 'string') obj[ch.segment] = null
  }
  return obj
}

/** 在容器节点内添加子项 */
export function addChildNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (!target || (target.type !== 'object' && target.type !== 'array')) return unchanged(model, uid)

  const p = resolvePolicy(policy)
  const path = getNodePath(model, uid)
  const nodes = new Map(model)
  const existingChildren = getChildIds(model, uid)
  const nextOrder = existingChildren.length
  let newId: string

  if (target.type === 'array') {
    newId = addNodeToMap(nodes, p.createDefaultArrayItem(path), uid, nextOrder, nextOrder)
  } else {
    const nextKey = p.suggestChildKey(collectSiblingKeys(model, uid), path)
    newId = addNodeToMap(nodes, p.createDefaultObjectValue(path, nextKey), uid, nextKey, nextOrder)
  }
  return makeResult(nodes, newId, uid)
}

/** 在同级位置（后方）添加兄弟项 */
export function addSiblingNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (target?.parentId === undefined || target.parentId === null) return addChildNode(model, uid, policy)

  const parent = model.get(target.parentId)
  if (!parent) return unchanged(model, uid)
  const p = resolvePolicy(policy)
  const parentPath = getNodePath(model, parent.id)
  const nodes = new Map(model)
  let newId: string

  if (parent.type === 'array') {
    const newOrder = target.order + 1
    // 将 order >= newOrder 的现有兄弟后移
    for (const sibId of getChildIds(model, parent.id)) {
      const sib = nodes.get(sibId)
      if (sib && sib.order >= newOrder) {
        nodes.set(sib.id, { ...sib, order: sib.order + 1 })
      }
    }
    newId = addNodeToMap(nodes, p.createDefaultArrayItem(parentPath), parent.id, newOrder, newOrder)
    reindexChildren(nodes, parent.id)
  } else {
    const siblings = getChildIds(model, parent.id)
    const nextKey = p.suggestChildKey(collectSiblingKeys(model, parent.id), parentPath)
    newId = addNodeToMap(nodes, p.createDefaultObjectValue(parentPath, nextKey), parent.id, nextKey, siblings.length)
  }
  return makeResult(nodes, newId, parent.id)
}

/** 删除节点（根节点和受保护节点不可删除） */
export function deleteNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (target?.parentId === undefined || target.parentId === null) return unchanged(model, uid)
  if (resolvePolicy(policy).isProtected(getNodePath(model, uid))) return unchanged(model, uid)

  const parent = model.get(target.parentId)
  if (!parent) return unchanged(model, uid)
  const nodes = new Map(model)

  removeSubtree(nodes, uid)
  if (parent.type === 'array') reindexChildren(nodes, parent.id)
  return makeResult(nodes, parent.id, parent.id)
}

/** 重命名对象键 */
export function renameNodeKey(model: TreeModel, uid: string, nextKeyInput: string, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (!target) return unchanged(model, uid)
  if (!resolvePolicy(policy).canEditKey(getNodePath(model, uid))) return unchanged(model, uid)

  const nextKey = nextKeyInput.trim()
  if (nextKey.length === 0 || typeof target.segment !== 'string') return unchanged(model, uid)

  const parent = target.parentId !== null ? (model.get(target.parentId) ?? null) : null
  const uniqueKey = ensureUniqueObjectKey(
    parent ? collectSiblingKeys(model, parent.id) : {},
    nextKey, target.segment,
  )
  if (uniqueKey === target.segment) return unchanged(model, uid)

  const nodes = new Map(model)
  nodes.set(uid, { ...target, segment: uniqueKey })
  return makeResult(nodes, uid, parent?.id ?? null)
}

/** 切换节点类型 */
export function updateNodeType(model: TreeModel, uid: string, nextType: JsonNodeType, policy?: Partial<JsonTreePolicy>): MutationResult {
  const target = model.get(uid)
  if (!target) return unchanged(model, uid)
  if (!resolvePolicy(policy).canEditType(getNodePath(model, uid))) return unchanged(model, uid)

  const nodes = new Map(model)
  for (const c of getChildIds(nodes, uid)) removeSubtree(nodes, c)

  const isContainer = nextType === 'object' || nextType === 'array'
  const defaultValue = createValueByType(nextType)
  nodes.set(uid, {
    ...target, type: nextType,
    value: isContainer ? null : toPrimitive(defaultValue),
  })
  return makeResult(nodes, uid)
}

/** 直接替换节点值 */
export function updateNodeValue(model: TreeModel, uid: string, nextValue: JsonValue): MutationResult {
  const target = model.get(uid)
  if (!target) return unchanged(model, uid)

  const nodes = new Map(model)
  for (const c of getChildIds(nodes, uid)) removeSubtree(nodes, c)

  const newType = inferNodeType(nextValue)
  const isContainer = newType === 'object' || newType === 'array'
  if (isContainer) {
    // 重建子树
    if (Array.isArray(nextValue)) {
      nextValue.forEach((item, i) => addNodeToMap(nodes, item, uid, i, i))
    } else if (isJsonObject(nextValue)) {
      let idx = 0
      for (const [k, v] of Object.entries(nextValue))
        addNodeToMap(nodes, v, uid, k, idx++)
    }
    nodes.set(uid, { ...target, type: newType, value: null })
  } else {
    nodes.set(uid, { ...target, type: newType, value: toPrimitive(nextValue) })
  }
  return makeResult(nodes, uid)
}

// ════════════════════════════════════════════════════════════
// 内部辅助
// ════════════════════════════════════════════════════════════

// ── 策略解析 ─────────────────────────────────────────────────

type ResolvedPolicy = Required<JsonTreePolicy>

const DEFAULT_POLICY: ResolvedPolicy = {
  rootLabel: '$',
  isProtected: () => false,
  canEditKey: (path) => path.length > 0 && typeof path[path.length - 1] === 'string',
  canEditType: (path) => path.length > 0,
  suggestChildKey: (target) => ensureUniqueObjectKey(target, 'newKey'),
  createDefaultArrayItem: () => '',
  createDefaultObjectValue: () => '',
  getValueOptions: () => undefined,
  getValueLabels: () => undefined,
  getAutoPopulate: () => undefined,
}

function resolvePolicy(partial?: Partial<JsonTreePolicy>): ResolvedPolicy {
  if (!partial) return DEFAULT_POLICY
  return {
    rootLabel: partial.rootLabel ?? DEFAULT_POLICY.rootLabel,
    isProtected: partial.isProtected ?? DEFAULT_POLICY.isProtected,
    canEditKey: partial.canEditKey ?? DEFAULT_POLICY.canEditKey,
    canEditType: partial.canEditType ?? DEFAULT_POLICY.canEditType,
    suggestChildKey: partial.suggestChildKey ?? DEFAULT_POLICY.suggestChildKey,
    createDefaultArrayItem: partial.createDefaultArrayItem ?? DEFAULT_POLICY.createDefaultArrayItem,
    createDefaultObjectValue: partial.createDefaultObjectValue ?? DEFAULT_POLICY.createDefaultObjectValue,
    getValueOptions: partial.getValueOptions ?? DEFAULT_POLICY.getValueOptions,
    getValueLabels: partial.getValueLabels ?? DEFAULT_POLICY.getValueLabels,
    getAutoPopulate: partial.getAutoPopulate ?? DEFAULT_POLICY.getAutoPopulate,
  }
}

// ── 类型推断 ─────────────────────────────────────────────────

function inferNodeType(value: JsonValue): JsonNodeType {
  if (Array.isArray(value)) return 'array'
  if (isJsonObject(value)) return 'object'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'null'
}

export function formatValuePreview(type: JsonNodeType, value: JsonValue, childCount: number): string {
  if (type === 'object') return `${childCount} 个字段`
  if (type === 'array') return `${childCount} 项`
  if (type === 'null') return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' ? value : ''
}

// ── 通用工具 ─────────────────────────────────────────────────

function createValueByType(type: JsonNodeType): JsonValue {
  switch (type) {
    case 'object': return {}
    case 'array': return []
    case 'string': return ''
    case 'number': return 0
    case 'boolean': return false
    case 'null': return null
  }
}

export function ensureUniqueObjectKey(
  target: JsonObject,
  preferred: string,
  currentKey?: string,
): string {
  const baseKey = preferred.trim() || 'newKey'
  if (baseKey === currentKey) return baseKey
  if (!(baseKey in target)) return baseKey
  let index = 1
  while (`${baseKey}${index}` in target) index += 1
  return `${baseKey}${index}`
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ── 导出通用路径工具（供外部策略实现使用）────────────────────

/**
 * 从 JSON 对象中读取指定路径的值。路径不存在时抛异常。
 */
export function getValueAtJsonPath(root: JsonDocument, path: JsonPath): JsonValue {
  let current: unknown = root
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) throw new Error(`路径不是数组: ${formatJsonPath(path)}`)
      current = current[segment]
    } else {
      if (!isJsonObject(current)) throw new Error(`路径不是对象: ${formatJsonPath(path)}`)
      current = current[segment]
    }
  }
  if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean' || current === null || Array.isArray(current) || isJsonObject(current)) {
    return current
  }
  throw new Error(`路径指向无效值: ${formatJsonPath(path)}`)
}

/**
 * 将 AutoPopulateEntry[] 应用到 JSON 文档上。
 *
 * - 沿 targetPath 导航到目标对象（中间不存在则跳过）
 * - 对 entries 中的每个 key：
 *   - 若不存在 → 直接写入
 *   - 若已存在且新旧值都是 object → 递归一层补缺
 *   - 否则跳过
 *
 * 返回 true 表示有实际变更。
 */
export function applyAutoPopulatePatches(
  doc: JsonDocument,
  patches: AutoPopulateEntry[],
): boolean {
  let modified = false
  for (const { targetPath, entries } of patches) {
    let target: unknown = doc
    for (const seg of targetPath) {
      if (typeof seg === 'number' && Array.isArray(target)) {
        target = target[seg]
      } else if (typeof seg === 'string' && isJsonObject(target)) {
        target = target[seg]
      } else {
        target = undefined
        break
      }
    }
    if (!isJsonObject(target)) continue

    for (const [key, value] of Object.entries(entries)) {
      if (key in target) {
        // 已存在 — 若新旧都是 object 则递归一层补缺
        if (isJsonObject(target[key]) && isJsonObject(value)) {
          const existing = target[key]
          for (const [subKey, subVal] of Object.entries(value)) {
            if (!(subKey in existing)) {
              existing[subKey] = subVal
              modified = true
            }
          }
        }
        continue
      }
      target[key] = value
      modified = true
    }
  }
  return modified
}

// ════════════════════════════════════════════════════════════
// 平铺 ↔ 树往返管线（UUID 方案）
// ════════════════════════════════════════════════════════════

/** 平铺文档（保留根类型，便于还原） */
export interface FlatJsonTreeDocument {
  readonly rootType: 'object' | 'array'
  readonly rows: TreeNode[]
}

/**
 * 将 JsonDocument 展开为平铺行数组（带 UUID），用于编辑态。
 *
 * 不包含虚拟根节点——顶层条目的 parentId 为 null，根类型由 rootType 字段表达。
 */
export function flattenJsonDocumentForEdit(doc: JsonDocument): FlatJsonTreeDocument {
  const rootType: FlatJsonTreeDocument['rootType'] = Array.isArray(doc) ? 'array' : 'object'
  const rows: TreeNode[] = []

  function walk(value: JsonValue, parentId: string | null, segment: string | number, order: number): void {
    const id = generateUid()
    const type = inferNodeType(value)
    const isContainer = type === 'object' || type === 'array'

    rows.push({
      id, parentId, segment, type,
      value: isContainer ? null : toPrimitive(value),
      order,
    })

    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, id, i, i))
    } else if (isJsonObject(value)) {
      let idx = 0
      for (const [k, v] of Object.entries(value)) walk(v, id, k, idx++)
    }
  }

  if (Array.isArray(doc)) {
    doc.forEach((item, i) => walk(item, null, i, i))
  } else {
    let idx = 0
    for (const [k, v] of Object.entries(doc)) walk(v, null, k, idx++)
  }

  return { rootType, rows }
}

/**
 * 从平铺行还原 JsonDocument。按 `order` 字段排序同级子节点。
 *
 * 失败快速：parentId 指向不存在的节点时抛异常。
 */
export function restoreJsonDocumentFromFlat(flat: FlatJsonTreeDocument): JsonDocument {
  const { rows, rootType } = flat
  const idMap = new Map<string, TreeNode>()
  const childrenMap = new Map<string | null, TreeNode[]>()

  for (const row of rows) {
    idMap.set(row.id, row)
    const siblings = childrenMap.get(row.parentId)
    if (siblings) siblings.push(row)
    else childrenMap.set(row.parentId, [row])
  }

  for (const row of rows) {
    if (row.parentId !== null && !idMap.has(row.parentId)) {
      throw new Error(`restoreJsonDocumentFromFlat: missing parent "${row.parentId}"`)
    }
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => a.order - b.order)
  }

  function buildValue(row: TreeNode): JsonValue {
    const children = childrenMap.get(row.id)
    if (row.type === 'array') return (children ?? []).map(c => buildValue(c))
    if (row.type === 'object') {
      const obj: JsonObject = {}
      for (const c of children ?? []) {
        const key = typeof c.segment === 'string' ? c.segment : String(c.segment)
        obj[key] = buildValue(c)
      }
      return obj
    }
    return row.value
  }

  const roots = childrenMap.get(null) ?? []
  if (rootType === 'array') {
    const items: JsonValue[] = roots.map(r => buildValue(r))
    return items
  }
  const obj: JsonObject = {}
  for (const r of roots) {
    const key = typeof r.segment === 'string' ? r.segment : String(r.segment)
    obj[key] = buildValue(r)
  }
  return obj
}

/**
 * 便捷入口：按 originalData 的类型还原（对象 → 对象，数组 → 数组）。
 */
export function restoreJsonDocumentByOriginalType(
  rows: TreeNode[],
  originalData: JsonDocument,
): JsonDocument {
  const rootType: FlatJsonTreeDocument['rootType'] = Array.isArray(originalData) ? 'array' : 'object'
  return restoreJsonDocumentFromFlat({ rootType, rows })
}
