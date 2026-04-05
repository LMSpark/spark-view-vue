// ══════════════════════════════════════════════════════════════
// jsonTreeEditor.ts — 通用 JSON 树编辑器核心
//
// 设计原则：
//   - 路径即 ID：formatJsonPath(path) 保证唯一，天然表达父子关系
//   - 平坦行输出：直供 VXE treeConfig.transform = true
//   - 策略注入：领域特化逻辑（保护规则、默认值）通过 JsonTreePolicy 外部提供
//   - 不可变变更：所有 mutation 返回新根对象，不修改原始数据
// ══════════════════════════════════════════════════════════════

// ── 基础 JSON 类型 ──────────────────────────────────────────

type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  [key: string]: JsonValue
}

// ── 路径类型 ────────────────────────────────────────────────

export type JsonPathSegment = string | number
export type JsonPath = JsonPathSegment[]

// ── 节点类型 ────────────────────────────────────────────────

export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

// ── 树行（平坦、parentId 驱动）──────────────────────────────

export interface JsonTreeRow {
  /** 行 ID = formatJsonPath(path)，树内唯一 */
  id: string
  /** 父行 ID；根节点为 null */
  parentId: string | null
  /** 原始路径段 */
  path: JsonPath
  /** 路径文本（= id，显示用） */
  pathText: string
  /** 嵌套深度（根 = 0） */
  depth: number
  /** 最后一段的原始键 */
  key: string
  /** 显示用键名 */
  displayKey: string
  /** 节点类型（根节点为 'root'） */
  type: JsonNodeType | 'root'
  /** 父节点类型 */
  parentType: (JsonNodeType | 'root') | null
  /** 是否容器（object / array / root） */
  isContainer: boolean
  /** 直接子节点数 */
  childCount: number
  /** 值预览文本 */
  valuePreview: string
  /** string 类型的实际值 */
  stringValue: string
  /** number 类型的实际值 */
  numberValue: number | null
  /** boolean 类型的实际值 */
  booleanValue: boolean
  /** 键是否可重命名 */
  keyEditable: boolean
  /** 类型是否可切换 */
  typeEditable: boolean
  /** 是否可删除 */
  deletable: boolean
}

// ── Schema 信息 ──────────────────────────────────────────────

export interface JsonSchemaInfo {
  title: string
  description: string
  required: boolean
  enumValues: string[]
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

export function parseJsonDocument(rawText: string): JsonObject {
  const parsed: unknown = JSON.parse(rawText)
  if (!isJsonObject(parsed)) {
    throw new Error('JSON 顶层必须是对象')
  }
  return parsed
}

export function serializeJsonDocument(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

// ════════════════════════════════════════════════════════════
// 构建平坦树行
// ════════════════════════════════════════════════════════════

/**
 * 将 JSON 对象递归展开为平坦行数组（深度优先序）。
 *
 * 每行的 `id = formatJsonPath(path)` 保证唯一，`parentId` 指向父行 id。
 * 可直接喂给 VXE 的 `treeConfig.transform = true`。
 */
export function buildJsonTreeRows(
  value: JsonObject,
  policy?: Partial<JsonTreePolicy>,
): JsonTreeRow[] {
  const p = resolvePolicy(policy)
  const rows: JsonTreeRow[] = []
  appendRow(rows, value, [], p.rootLabel, 'root', null, p)
  return rows
}

function appendRow(
  out: JsonTreeRow[],
  value: JsonValue,
  path: JsonPath,
  displayKey: string,
  explicitType: JsonNodeType | 'root',
  parentType: (JsonNodeType | 'root') | null,
  policy: ResolvedPolicy,
): void {
  const actualType = explicitType === 'root' ? 'root' : inferNodeType(value)
  const id = formatJsonPath(path)
  const parentId = path.length === 0 ? null : formatJsonPath(path.slice(0, -1))
  const lastSegment = path[path.length - 1]
  const key = typeof lastSegment === 'string' ? lastSegment : displayKey

  let childCount = 0
  if (actualType === 'root' || actualType === 'object') {
    childCount = isJsonObject(value) ? Object.keys(value).length : 0
  } else if (actualType === 'array') {
    childCount = Array.isArray(value) ? value.length : 0
  }

  out.push({
    id,
    parentId,
    path: [...path],
    pathText: id,
    depth: path.length,
    key,
    displayKey,
    type: actualType,
    parentType,
    isContainer: actualType === 'root' || actualType === 'object' || actualType === 'array',
    childCount,
    valuePreview: formatValuePreview(actualType, value, childCount),
    stringValue: typeof value === 'string' ? value : '',
    numberValue: typeof value === 'number' ? value : null,
    booleanValue: value === true,
    keyEditable: policy.canEditKey(path),
    typeEditable: policy.canEditType(path),
    deletable: path.length > 0 && !policy.isProtected(path),
  })

  // 递归子节点
  if (actualType === 'root' || actualType === 'object') {
    const obj = value as JsonObject
    for (const [childKey, childValue] of Object.entries(obj)) {
      appendRow(out, childValue, [...path, childKey], childKey, inferNodeType(childValue), actualType, policy)
    }
  } else if (actualType === 'array') {
    const arr = value as JsonValue[]
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i] as JsonValue
      appendRow(out, item, [...path, i], `[${i}]`, inferNodeType(item), actualType, policy)
    }
  }
}

// ════════════════════════════════════════════════════════════
// 过滤（保留命中行的所有祖先）
// ════════════════════════════════════════════════════════════

export function filterJsonTreeRows<T extends JsonTreeRow>(
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
// 变更操作（纯函数，不可变，返回新根对象）
// ════════════════════════════════════════════════════════════

/**
 * 在 path 指向的容器节点内添加一个子项。
 * - 对象：用 policy.suggestChildKey + createDefaultObjectValue
 * - 数组：用 policy.createDefaultArrayItem 追加末尾
 */
export function addChildNode(
  root: JsonObject,
  path: JsonPath,
  policy?: Partial<JsonTreePolicy>,
): JsonObject {
  const p = resolvePolicy(policy)
  const target = getValueAtPath(root, path)

  if (Array.isArray(target)) {
    const nextItem = p.createDefaultArrayItem(path)
    return updateValueAtPath(root, path, [...target, nextItem])
  }

  if (!isJsonObject(target)) return root

  const nextKey = p.suggestChildKey(target, path)
  const nextValue = p.createDefaultObjectValue(path, nextKey)
  return updateValueAtPath(root, path, { ...target, [nextKey]: nextValue })
}

/**
 * 在 path 指向的节点的同级位置（后方）添加一个兄弟项。
 * - 数组：在当前索引 +1 处插入
 * - 对象：在父对象中添加新键
 */
export function addSiblingNode(
  root: JsonObject,
  path: JsonPath,
  policy?: Partial<JsonTreePolicy>,
): JsonObject {
  if (path.length === 0) return addChildNode(root, path, policy)

  const p = resolvePolicy(policy)
  const parentPath = path.slice(0, -1)
  const parentValue = getValueAtPath(root, parentPath)
  const currentSegment = path[path.length - 1]

  if (Array.isArray(parentValue) && typeof currentSegment === 'number') {
    const nextItem = p.createDefaultArrayItem(parentPath)
    const nextArray = [...parentValue]
    nextArray.splice(currentSegment + 1, 0, nextItem)
    return updateValueAtPath(root, parentPath, nextArray)
  }

  if (isJsonObject(parentValue)) {
    const nextKey = p.suggestChildKey(parentValue, parentPath)
    const nextValue = p.createDefaultObjectValue(parentPath, nextKey)
    return updateValueAtPath(root, parentPath, { ...parentValue, [nextKey]: nextValue })
  }

  return root
}

/**
 * 删除 path 指向的节点。根节点和受保护节点不可删除。
 */
export function deleteNode(
  root: JsonObject,
  path: JsonPath,
  policy?: Partial<JsonTreePolicy>,
): JsonObject {
  const p = resolvePolicy(policy)
  if (path.length === 0 || p.isProtected(path)) return root

  const parentPath = path.slice(0, -1)
  const parentValue = getValueAtPath(root, parentPath)
  const currentSegment = path[path.length - 1]

  if (Array.isArray(parentValue) && typeof currentSegment === 'number') {
    const nextArray = [...parentValue]
    nextArray.splice(currentSegment, 1)
    return updateValueAtPath(root, parentPath, nextArray)
  }

  if (isJsonObject(parentValue) && typeof currentSegment === 'string') {
    const nextObject = Object.fromEntries(
      Object.entries(parentValue).filter(([key]) => key !== currentSegment),
    ) as JsonObject
    return updateValueAtPath(root, parentPath, nextObject)
  }

  return root
}

/**
 * 重命名 path 指向的对象键。保持键在父对象中的顺序。
 */
export function renameNodeKey(
  root: JsonObject,
  path: JsonPath,
  nextKeyInput: string,
  policy?: Partial<JsonTreePolicy>,
): JsonObject {
  const p = resolvePolicy(policy)
  if (!p.canEditKey(path)) return root

  const nextKey = nextKeyInput.trim()
  if (nextKey.length === 0) return root

  const currentSegment = path[path.length - 1]
  if (typeof currentSegment !== 'string') return root

  const parentPath = path.slice(0, -1)
  const parentValue = getValueAtPath(root, parentPath)
  if (!isJsonObject(parentValue)) return root

  const uniqueKey = ensureUniqueObjectKey(parentValue, nextKey, currentSegment)
  if (uniqueKey === currentSegment) return root

  // 保持键顺序，仅替换目标键名
  const renamedEntries: Array<[string, JsonValue]> = Object.entries(parentValue).map(
    ([key, value]) => key === currentSegment ? [uniqueKey, value] : [key, value],
  )
  return updateValueAtPath(root, parentPath, Object.fromEntries(renamedEntries) as JsonObject)
}

/**
 * 切换 path 指向的节点类型。值会被替换为目标类型的默认值。
 */
export function updateNodeType(
  root: JsonObject,
  path: JsonPath,
  nextType: JsonNodeType,
  policy?: Partial<JsonTreePolicy>,
): JsonObject {
  const p = resolvePolicy(policy)
  if (!p.canEditType(path)) return root
  return updateValueAtPath(root, path, createValueByType(nextType))
}

/**
 * 更新字符串值。
 */
export function updateNodeStringValue(
  root: JsonObject,
  path: JsonPath,
  nextValue: string,
): JsonObject {
  return updateValueAtPath(root, path, nextValue)
}

/**
 * 更新数字值。非有限数回退为 0。
 */
export function updateNodeNumberValue(
  root: JsonObject,
  path: JsonPath,
  nextValue: number | null | undefined,
): JsonObject {
  const safeValue = typeof nextValue === 'number' && Number.isFinite(nextValue) ? nextValue : 0
  return updateValueAtPath(root, path, safeValue)
}

/**
 * 更新布尔值。
 */
export function updateNodeBooleanValue(
  root: JsonObject,
  path: JsonPath,
  nextValue: boolean,
): JsonObject {
  return updateValueAtPath(root, path, nextValue)
}

// ════════════════════════════════════════════════════════════
// Schema 解析（JSON Schema Draft-07 兼容）
// ════════════════════════════════════════════════════════════

type JsonSchemaRecord = Record<string, unknown>

/**
 * 根据路径从 JSON Schema 解析出该节点的标题、描述、是否必填、枚举值列表。
 */
export function resolveSchemaInfoForPath(
  schema: Record<string, unknown> | null | undefined,
  path: JsonPath,
): JsonSchemaInfo {
  if (!schema) return emptySchemaInfo()

  const defs = asSchemaRecord(schema['$defs'])
  const parentSchema = resolveSchemaNode(schema, path.slice(0, -1), defs)
  const schemaNode = resolveSchemaNode(schema, path, defs)
  const lastSegment = path[path.length - 1]
  const required = typeof lastSegment === 'string'
    ? listRequiredKeys(parentSchema).includes(lastSegment)
    : false

  return {
    title: readSchemaString(schemaNode, 'title'),
    description: readSchemaString(schemaNode, 'description'),
    required,
    enumValues: readSchemaEnum(schemaNode),
  }
}

function resolveSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  path: JsonPath,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  let current = normalizeSchemaNode(schemaNode, defs)
  for (const segment of path) {
    if (!current) return null
    current = selectChildSchema(current, segment, defs)
  }
  return current
}

function normalizeSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  if (!schemaNode) return null

  const refValue = schemaNode['$ref']
  if (typeof refValue === 'string' && refValue.startsWith('#/$defs/') && defs) {
    const refKey = refValue.slice('#/$defs/'.length)
    const target = asSchemaRecord(defs[refKey])
    return normalizeSchemaNode(target ?? schemaNode, defs)
  }

  if (Array.isArray(schemaNode['oneOf'])) {
    return schemaNode
  }

  return schemaNode
}

function selectChildSchema(
  schemaNode: JsonSchemaRecord,
  segment: JsonPathSegment,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) return null

  const oneOf = normalized['oneOf']
  if (Array.isArray(oneOf)) {
    const candidate = oneOf
      .map((entry) => normalizeSchemaNode(asSchemaRecord(entry), defs))
      .find((entry) => entry !== null && schemaCanAcceptSegment(entry, segment, defs))
    return candidate ?? null
  }

  if (typeof segment === 'number') {
    return normalizeSchemaNode(asSchemaRecord(normalized['items']), defs)
  }

  const properties = asSchemaRecord(normalized['properties'])
  if (properties?.[segment] !== undefined) {
    return normalizeSchemaNode(asSchemaRecord(properties[segment]), defs)
  }

  return normalizeSchemaNode(asSchemaRecord(normalized['additionalProperties']), defs)
}

function schemaCanAcceptSegment(
  schemaNode: JsonSchemaRecord,
  segment: JsonPathSegment,
  defs: JsonSchemaRecord | null,
): boolean {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) return false

  if (typeof segment === 'number') {
    return normalized['items'] !== undefined || normalized['type'] === 'array'
  }

  const properties = asSchemaRecord(normalized['properties'])
  return Boolean(
    normalized['type'] === 'object'
    || properties?.[segment] !== undefined
    || normalized['additionalProperties'] !== undefined,
  )
}

function listRequiredKeys(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['required'])) return []
  return schemaNode['required'].filter((entry): entry is string => typeof entry === 'string')
}

function readSchemaString(schemaNode: JsonSchemaRecord | null, key: 'title' | 'description'): string {
  const value = schemaNode?.[key]
  return typeof value === 'string' ? value : ''
}

function readSchemaEnum(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['enum'])) return []
  return schemaNode['enum'].filter((entry): entry is string => typeof entry === 'string')
}

function emptySchemaInfo(): JsonSchemaInfo {
  return { title: '', description: '', required: false, enumValues: [] }
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

function formatValuePreview(type: JsonNodeType | 'root', value: JsonValue, childCount: number): string {
  if (type === 'root' || type === 'object') return `${childCount} 个字段`
  if (type === 'array') return `${childCount} 项`
  if (type === 'null') return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' ? value : ''
}

// ── 路径读写 ─────────────────────────────────────────────────

function getValueAtPath(root: JsonObject, path: JsonPath): JsonValue {
  let current: JsonValue = root
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) throw new Error(`路径不是数组: ${formatJsonPath(path)}`)
      current = current[segment] as JsonValue
    } else {
      if (!isJsonObject(current)) throw new Error(`路径不是对象: ${formatJsonPath(path)}`)
      current = current[segment] as JsonValue
    }
  }
  return current
}

function updateValueAtPath(root: JsonObject, path: JsonPath, nextValue: JsonValue): JsonObject {
  if (path.length === 0) {
    return isJsonObject(nextValue) ? nextValue : root
  }
  return applyPathUpdate(root, path, () => nextValue) as JsonObject
}

function applyPathUpdate(
  current: JsonValue,
  path: JsonPath,
  updater: (value: JsonValue) => JsonValue,
): JsonValue {
  if (path.length === 0) return updater(current)

  const segment = path[0]
  if (segment === undefined) return updater(current)
  const rest = path.slice(1)

  if (typeof segment === 'number') {
    if (!Array.isArray(current)) throw new Error(`路径不是数组: ${formatJsonPath(path)}`)
    const nextArray = [...current]
    nextArray[segment] = applyPathUpdate(nextArray[segment] as JsonValue, rest, updater)
    return nextArray
  }

  if (!isJsonObject(current)) throw new Error(`路径不是对象: ${formatJsonPath(path)}`)
  return {
    ...current,
    [segment]: applyPathUpdate(current[segment] as JsonValue, rest, updater),
  }
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

function asSchemaRecord(value: unknown): JsonSchemaRecord | null {
  return isJsonObject(value) ? value : null
}

// ── 导出通用路径工具（供外部策略实现使用）────────────────────

/**
 * 从 JSON 对象中读取指定路径的值。路径不存在时抛异常。
 */
export function getValueAtJsonPath(root: JsonObject, path: JsonPath): JsonValue {
  return getValueAtPath(root, path)
}
