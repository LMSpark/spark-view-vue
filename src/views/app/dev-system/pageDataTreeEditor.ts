type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  [key: string]: JsonValue
}

export type PageDataPathSegment = string | number
export type PageDataPath = PageDataPathSegment[]

export type PageDataNodeType = 'root' | 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export interface PageDataTreeRow {
  id: string
  path: PageDataPath
  pathText: string
  depth: number
  key: string
  displayKey: string
  type: PageDataNodeType
  parentType: PageDataNodeType | null
  isContainer: boolean
  childCount: number
  valuePreview: string
  stringValue: string
  numberValue: number | null
  booleanValue: boolean
  keyEditable: boolean
  typeEditable: boolean
  deletable: boolean
  children?: PageDataTreeRow[]
}

export interface PageDataSchemaInfo {
  title: string
  description: string
  required: boolean
  enumValues: string[]
}

type JsonSchemaRecord = Record<string, unknown>

const ROOT_LABEL = 'pagedata'
const ROOT_TOP_LEVEL_KEYS = ['dataSetName', 'tables', 'tableRelations', 'viewDependencies', 'version', 'pageId'] as const
const CRUD_API_KEYS = ['list', 'retrieve', 'create', 'update', 'delete', 'children', 'path', 'subtree', 'move', 'search', 'nested', 'nestedSearch'] as const
const BATCH_API_KEYS = ['create', 'update', 'delete'] as const

export function parsePageDataDocument(rawText: string): JsonObject {
  const parsed: unknown = JSON.parse(rawText)
  if (!isJsonObject(parsed)) {
    throw new Error('pagedata.json 顶层必须是 JSON 对象')
  }
  return parsed
}

export function serializePageDataDocument(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function buildPageDataTreeRows(value: JsonObject): PageDataTreeRow[] {
  return [buildTreeRow(value, [], ROOT_LABEL, 'root', null)]
}

export function filterPageDataTreeRows<T extends { children?: T[] | undefined }>(
  rows: T[],
  predicate: (row: T) => boolean,
): T[] {
  return rows.flatMap((row) => {
    const nextChildren = row.children
      ? filterPageDataTreeRows(row.children, predicate)
      : undefined
    const matched = predicate(row)

    if (!matched && (!nextChildren || nextChildren.length === 0)) {
      return []
    }

    return [{
      ...row,
      ...(nextChildren ? { children: nextChildren } : {}),
    }]
  })
}

export function resolveSchemaInfoForPath(
  schema: Record<string, unknown> | null | undefined,
  path: PageDataPath,
): PageDataSchemaInfo {
  if (!schema) {
    return emptySchemaInfo()
  }

  const rootSchema = schema
  const defs = asRecord(rootSchema['$defs'])
  const parentSchema = resolveSchemaNode(rootSchema, path.slice(0, -1), defs)
  const schemaNode = resolveSchemaNode(rootSchema, path, defs)
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

export function formatPageDataPath(path: PageDataPath): string {
  if (path.length === 0) return '$'

  let text = '$'
  for (const segment of path) {
    if (typeof segment === 'number') {
      text += `[${segment}]`
      continue
    }
    text += /^[A-Za-z_$][\w$]*$/.test(segment)
      ? `.${segment}`
      : `[${JSON.stringify(segment)}]`
  }
  return text
}

export function addChildNode(root: JsonObject, path: PageDataPath): JsonObject {
  const target = getValueAtPath(root, path)
  if (Array.isArray(target)) {
    const nextItem = createDefaultArrayItem(path)
    return updateValueAtPath(root, path, [...target, nextItem])
  }

  if (!isJsonObject(target)) {
    return root
  }

  const nextKey = suggestObjectEntryKey(target, path)
  const nextValue = createDefaultObjectEntryValue(path, nextKey)
  return updateValueAtPath(root, path, {
    ...target,
    [nextKey]: nextValue,
  })
}

export function addSiblingNode(root: JsonObject, path: PageDataPath): JsonObject {
  if (path.length === 0) {
    return addChildNode(root, path)
  }

  const parentPath = path.slice(0, -1)
  const parentValue = getValueAtPath(root, parentPath)
  const currentSegment = path[path.length - 1]

  if (Array.isArray(parentValue) && typeof currentSegment === 'number') {
    const nextItem = createDefaultArrayItem(parentPath)
    const nextArray = [...parentValue]
    nextArray.splice(currentSegment + 1, 0, nextItem)
    return updateValueAtPath(root, parentPath, nextArray)
  }

  if (isJsonObject(parentValue)) {
    const nextKey = suggestObjectEntryKey(parentValue, parentPath)
    const nextValue = createDefaultObjectEntryValue(parentPath, nextKey)
    return updateValueAtPath(root, parentPath, {
      ...parentValue,
      [nextKey]: nextValue,
    })
  }

  return root
}

export function deleteNode(root: JsonObject, path: PageDataPath): JsonObject {
  if (path.length === 0 || isProtectedPath(path)) {
    return root
  }

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

export function renameNodeKey(root: JsonObject, path: PageDataPath, nextKeyInput: string): JsonObject {
  if (!canEditNodeKey(path)) {
    return root
  }

  const nextKey = nextKeyInput.trim()
  if (nextKey.length === 0) {
    return root
  }

  const currentSegment = path[path.length - 1]
  if (typeof currentSegment !== 'string') {
    return root
  }

  const parentPath = path.slice(0, -1)
  const parentValue = getValueAtPath(root, parentPath)
  if (!isJsonObject(parentValue)) {
    return root
  }

  const uniqueKey = ensureUniqueObjectKey(parentValue, nextKey, currentSegment)
  if (uniqueKey === currentSegment) {
    return root
  }

  const entries = Object.entries(parentValue)
  const renamedEntries: Array<[string, JsonValue]> = entries.map(([key, value]) => {
    if (key === currentSegment) {
      return [uniqueKey, value]
    }
    return [key, value]
  })

  return updateValueAtPath(root, parentPath, Object.fromEntries(renamedEntries) as JsonObject)
}

export function updateNodeType(root: JsonObject, path: PageDataPath, nextType: Exclude<PageDataNodeType, 'root'>): JsonObject {
  if (!canEditNodeType(path)) {
    return root
  }
  return updateValueAtPath(root, path, createValueByType(nextType))
}

export function updateNodeStringValue(root: JsonObject, path: PageDataPath, nextValue: string): JsonObject {
  return updateValueAtPath(root, path, nextValue)
}

export function updateNodeNumberValue(root: JsonObject, path: PageDataPath, nextValue: number | null | undefined): JsonObject {
  return updateValueAtPath(root, path, typeof nextValue === 'number' && Number.isFinite(nextValue) ? nextValue : 0)
}

export function updateNodeBooleanValue(root: JsonObject, path: PageDataPath, nextValue: boolean): JsonObject {
  return updateValueAtPath(root, path, nextValue)
}

function buildTreeRow(
  value: JsonValue,
  path: PageDataPath,
  displayKey: string,
  currentType: PageDataNodeType,
  parentType: PageDataNodeType | null,
): PageDataTreeRow {
  const actualType = currentType === 'root' ? 'root' : inferNodeType(value)
  const key = typeof path[path.length - 1] === 'string' ? String(path[path.length - 1]) : displayKey
  const childRows = (actualType === 'root' || actualType === 'object')
    ? Object.entries(value as JsonObject).map(([childKey, childValue]) => {
      return buildTreeRow(childValue, [...path, childKey], childKey, inferNodeType(childValue), actualType)
    })
    : actualType === 'array'
      ? (value as JsonValue[]).map((childValue, index) => {
        return buildTreeRow(childValue, [...path, index], `[${index}]`, inferNodeType(childValue), actualType)
      })
      : undefined

  return {
    id: path.length === 0 ? '$' : formatPageDataPath(path),
    path: [...path],
    pathText: formatPageDataPath(path),
    depth: path.length,
    key,
    displayKey,
    type: actualType,
    parentType,
    isContainer: actualType === 'root' || actualType === 'object' || actualType === 'array',
    childCount: childRows?.length ?? 0,
    valuePreview: formatValuePreview(actualType, value, childRows?.length ?? 0),
    stringValue: typeof value === 'string' ? value : '',
    numberValue: typeof value === 'number' ? value : null,
    booleanValue: value === true,
    keyEditable: canEditNodeKey(path),
    typeEditable: canEditNodeType(path),
    deletable: path.length > 0 && !isProtectedPath(path),
    ...(childRows && childRows.length > 0 ? { children: childRows } : {}),
  }
}

function inferNodeType(value: JsonValue): Exclude<PageDataNodeType, 'root'> {
  if (Array.isArray(value)) return 'array'
  if (isJsonObject(value)) return 'object'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'null'
}

function formatValuePreview(type: PageDataNodeType, value: JsonValue, childCount: number): string {
  if (type === 'root' || type === 'object') {
    return `${childCount} 个字段`
  }
  if (type === 'array') {
    return `${childCount} 项`
  }
  if (type === 'null') {
    return 'null'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return typeof value === 'string' ? value : ''
}

function getValueAtPath(root: JsonObject, path: PageDataPath): JsonValue {
  let current: JsonValue = root
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        throw new Error(`路径不是数组: ${formatPageDataPath(path)}`)
      }
      current = current[segment] as JsonValue
      continue
    }

    if (!isJsonObject(current)) {
      throw new Error(`路径不是对象: ${formatPageDataPath(path)}`)
    }
    current = current[segment] as JsonValue
  }
  return current
}

function updateValueAtPath(root: JsonObject, path: PageDataPath, nextValue: JsonValue): JsonObject {
  if (path.length === 0) {
    return isJsonObject(nextValue) ? nextValue : root
  }

  return applyPathUpdate(root, path, () => nextValue) as JsonObject
}

function applyPathUpdate(current: JsonValue, path: PageDataPath, updater: (value: JsonValue) => JsonValue): JsonValue {
  if (path.length === 0) {
    return updater(current)
  }

  const segment = path[0]
  if (segment === undefined) {
    return updater(current)
  }

  const rest = path.slice(1)
  if (typeof segment === 'number') {
    if (!Array.isArray(current)) {
      throw new Error(`路径不是数组: ${formatPageDataPath(path)}`)
    }
    const nextArray = [...current]
    nextArray[segment] = applyPathUpdate(nextArray[segment] as JsonValue, rest, updater)
    return nextArray
  }

  if (!isJsonObject(current)) {
    throw new Error(`路径不是对象: ${formatPageDataPath(path)}`)
  }

  const currentValue = current[segment]
  return {
    ...current,
    [segment]: applyPathUpdate(currentValue as JsonValue, rest, updater),
  }
}

function createDefaultArrayItem(path: PageDataPath): JsonValue {
  if (isTableColumnsPath(path)) {
    return createDefaultColumn()
  }
  if (isTableRelationsPath(path)) {
    return createDefaultTableRelation()
  }
  if (isViewDependenciesPath(path)) {
    return createDefaultViewDependency()
  }
  if (isSortExpressionPath(path)) {
    return createDefaultSortField()
  }
  if (isRowsPath(path)) {
    return {}
  }
  return ''
}

function createDefaultObjectEntryValue(parentPath: PageDataPath, key: string): JsonValue {
  if (parentPath.length === 0) {
    return createDefaultRootEntryValue(key)
  }
  if (isTablesPath(parentPath)) {
    return createDefaultTableMetadata(key)
  }
  if (isViewsPath(parentPath)) {
    return createDefaultViewMetadata(key)
  }
  if (isAggregatesPath(parentPath)) {
    return createDefaultAggregateColumnConfig()
  }
  if (isApiPath(parentPath)) {
    return key === 'batch'
      ? {}
      : createDefaultHttpEndpoint(key === 'list' ? 'GET' : key === 'delete' ? 'DELETE' : 'POST')
  }
  if (isBatchApiPath(parentPath)) {
    return createDefaultHttpEndpoint(key === 'delete' ? 'DELETE' : 'POST')
  }
  if (isRowsObjectPath(parentPath)) {
    return ''
  }
  return ''
}

function createDefaultRootEntryValue(key: string): JsonValue {
  if (key === 'dataSetName') return 'PageDataSet'
  if (key === 'tables') return {}
  if (key === 'tableRelations') return []
  if (key === 'viewDependencies') return []
  if (key === 'version') return 1
  if (key === 'pageId') return 'new-page'
  return ''
}

function createDefaultTableMetadata(tableName: string): JsonObject {
  return {
    tableName,
    columns: [],
    views: {
      default: {},
    },
  }
}

function createDefaultViewMetadata(viewId: string): JsonObject {
  if (viewId === 'default') {
    return {}
  }
  return {
    rows: [],
  }
}

function createDefaultColumn(): JsonObject {
  return {
    name: 'newField',
    type: 'string',
    label: '新字段',
  }
}

function createDefaultTableRelation(): JsonObject {
  return {
    parentTable: 'ParentTable',
    childTable: 'ChildTable',
    parentField: 'id',
    childField: 'parentId',
  }
}

function createDefaultViewDependency(): JsonObject {
  return {
    parentTable: 'ParentTable',
    childTable: 'ChildTable',
    dependencyType: 'currentRow',
    autoLoad: true,
  }
}

function createDefaultSortField(): JsonObject {
  return {
    field: 'id',
    direction: 'asc',
  }
}

function createDefaultAggregateColumnConfig(): JsonObject {
  return {
    type: 'sum',
  }
}

function createDefaultHttpEndpoint(method: 'GET' | 'POST' | 'DELETE'): JsonObject {
  return {
    url: '/api/resource',
    method,
  }
}

function createValueByType(type: Exclude<PageDataNodeType, 'root'>): JsonValue {
  switch (type) {
    case 'object':
      return {}
    case 'array':
      return []
    case 'string':
      return ''
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'null':
      return null
  }
}

function suggestObjectEntryKey(target: JsonObject, parentPath: PageDataPath): string {
  const existingKeys = new Set(Object.keys(target))
  const preferredKeys = getPreferredObjectKeys(parentPath)
  for (const candidate of preferredKeys) {
    if (!existingKeys.has(candidate)) {
      return candidate
    }
  }

  if (isTablesPath(parentPath)) {
    return ensureUniqueObjectKey(target, 'NewTable')
  }
  if (isViewsPath(parentPath)) {
    return ensureUniqueObjectKey(target, 'view1')
  }
  if (isAggregatesPath(parentPath)) {
    return ensureUniqueObjectKey(target, 'newAggregate')
  }
  if (isRowsObjectPath(parentPath)) {
    return ensureUniqueObjectKey(target, 'newField')
  }
  return ensureUniqueObjectKey(target, 'newField')
}

function getPreferredObjectKeys(parentPath: PageDataPath): string[] {
  if (parentPath.length === 0) {
    return [...ROOT_TOP_LEVEL_KEYS]
  }
  if (isViewsPath(parentPath)) {
    return ['default', 'options', 'detail', 'grid']
  }
  if (isApiPath(parentPath)) {
    return [...CRUD_API_KEYS]
  }
  if (isBatchApiPath(parentPath)) {
    return [...BATCH_API_KEYS]
  }
  return []
}

function ensureUniqueObjectKey(target: JsonObject, preferred: string, currentKey?: string): string {
  const baseKey = preferred.trim() || 'newField'
  if (baseKey === currentKey) {
    return baseKey
  }
  if (!(baseKey in target)) {
    return baseKey
  }

  let index = 1
  while (`${baseKey}${index}` in target) {
    index += 1
  }
  return `${baseKey}${index}`
}

function canEditNodeKey(path: PageDataPath): boolean {
  if (path.length === 0) return false
  const parentPath = path.slice(0, -1)
  if (isTablesPath(parentPath)) {
    return true
  }
  if (isViewsPath(parentPath)) {
    return path[path.length - 1] !== 'default'
  }
  if (isAggregatesPath(parentPath)) {
    return true
  }
  return false
}

function canEditNodeType(path: PageDataPath): boolean {
  if (path.length === 0) return false
  if (isProtectedPath(path)) return false
  if (isProtectedContainerPath(path)) return false

  const parentPath = path.slice(0, -1)
  if (isTableColumnsPath(parentPath) || isTableRelationsPath(parentPath) || isViewDependenciesPath(parentPath) || isSortExpressionPath(parentPath)) {
    return false
  }
  return true
}

function isProtectedPath(path: PageDataPath): boolean {
  return path.length === 1 && path[0] === 'tables'
    || (path.length === 4
      && path[0] === 'tables'
      && typeof path[1] === 'string'
      && path[2] === 'views'
      && path[3] === 'default')
}

function isProtectedContainerPath(path: PageDataPath): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  if (last === 'tables' || last === 'tableRelations' || last === 'viewDependencies' || last === 'columns' || last === 'views' || last === 'rows' || last === 'sortExpression' || last === 'aggregates' || last === 'treeConfig' || last === 'api' || last === 'batch') {
    return true
  }
  if (path.length === 2 && path[0] === 'tables' && typeof path[1] === 'string') {
    return true
  }
  if (path.length === 4 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string') {
    return true
  }
  return false
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): JsonSchemaRecord | null {
  return isJsonObject(value) ? value : null
}

function isTablesPath(path: PageDataPath): boolean {
  return path.length === 1 && path[0] === 'tables'
}

function isTableColumnsPath(path: PageDataPath): boolean {
  return path.length === 3 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'columns'
}

function isViewsPath(path: PageDataPath): boolean {
  return path.length === 3 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views'
}

function isRowsPath(path: PageDataPath): boolean {
  return path.length === 5 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'rows'
}

function isRowsObjectPath(path: PageDataPath): boolean {
  return path.length === 6 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'rows' && typeof path[5] === 'number'
}

function isAggregatesPath(path: PageDataPath): boolean {
  return path.length === 5 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'aggregates'
}

function isSortExpressionPath(path: PageDataPath): boolean {
  return path.length === 5 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'sortExpression'
}

function isTableRelationsPath(path: PageDataPath): boolean {
  return path.length === 1 && path[0] === 'tableRelations'
}

function isViewDependenciesPath(path: PageDataPath): boolean {
  return path.length === 1 && path[0] === 'viewDependencies'
}

function isApiPath(path: PageDataPath): boolean {
  return path.length === 3 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'api'
}

function isBatchApiPath(path: PageDataPath): boolean {
  return path.length === 4 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'api' && path[3] === 'batch'
}

function resolveSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  path: PageDataPath,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  let currentNode = normalizeSchemaNode(schemaNode, defs)
  for (const segment of path) {
    if (!currentNode) {
      return null
    }

    currentNode = selectChildSchema(currentNode, segment, defs)
  }
  return currentNode
}

function normalizeSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  if (!schemaNode) {
    return null
  }

  const refValue = schemaNode['$ref']
  if (typeof refValue === 'string' && refValue.startsWith('#/$defs/') && defs) {
    const refKey = refValue.slice('#/$defs/'.length)
    const target = asRecord(defs[refKey])
    return normalizeSchemaNode(target ?? schemaNode, defs)
  }

  if (Array.isArray(schemaNode['oneOf'])) {
    return schemaNode
  }

  return schemaNode
}

function selectChildSchema(
  schemaNode: JsonSchemaRecord,
  segment: PageDataPathSegment,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) {
    return null
  }

  const oneOf = normalized['oneOf']
  if (Array.isArray(oneOf)) {
    const candidate = oneOf
      .map((entry) => normalizeSchemaNode(asRecord(entry), defs))
      .find((entry) => entry && schemaCanAcceptSegment(entry, segment, defs))
    return candidate ?? null
  }

  if (typeof segment === 'number') {
    return normalizeSchemaNode(asRecord(normalized['items']), defs)
  }

  const properties = asRecord(normalized['properties'])
  if (properties?.[segment] !== undefined) {
    return normalizeSchemaNode(asRecord(properties[segment]), defs)
  }

  return normalizeSchemaNode(asRecord(normalized['additionalProperties']), defs)
}

function schemaCanAcceptSegment(
  schemaNode: JsonSchemaRecord,
  segment: PageDataPathSegment,
  defs: JsonSchemaRecord | null,
): boolean {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) {
    return false
  }

  if (typeof segment === 'number') {
    return normalized['items'] !== undefined || normalized['type'] === 'array'
  }

  const properties = asRecord(normalized['properties'])
  return Boolean(
    normalized['type'] === 'object'
    || properties?.[segment] !== undefined
    || normalized['additionalProperties'] !== undefined,
  )
}

function listRequiredKeys(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['required'])) {
    return []
  }
  return schemaNode['required'].filter((entry): entry is string => typeof entry === 'string')
}

function readSchemaString(schemaNode: JsonSchemaRecord | null, key: 'title' | 'description'): string {
  const value = schemaNode?.[key]
  return typeof value === 'string' ? value : ''
}

function readSchemaEnum(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['enum'])) {
    return []
  }
  return schemaNode['enum'].filter((entry): entry is string => typeof entry === 'string')
}

function emptySchemaInfo(): PageDataSchemaInfo {
  return {
    title: '',
    description: '',
    required: false,
    enumValues: [],
  }
}