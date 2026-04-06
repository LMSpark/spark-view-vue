// ══════════════════════════════════════════════════════════════
// pageDataPolicy.ts — pagedata.json 领域策略
// ══════════════════════════════════════════════════════════════

import type { JsonObject, JsonPath, JsonTreePolicy, JsonValue } from '@spark-view/spark-component'
import { ensureUniqueObjectKey } from '@spark-view/spark-component'

// ── 路径判定 ─────────────────────────────────────────────────

function isTablesPath(path: JsonPath): boolean {
  return path.length === 1 && path[0] === 'tables'
}

function isTableColumnsPath(path: JsonPath): boolean {
  return path.length === 3 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'columns'
}

function isViewsPath(path: JsonPath): boolean {
  return path.length === 3 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views'
}

function isRowsPath(path: JsonPath): boolean {
  return path.length === 5 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'rows'
}

function isRowsObjectPath(path: JsonPath): boolean {
  return path.length === 6 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'rows' && typeof path[5] === 'number'
}

function isAggregatesPath(path: JsonPath): boolean {
  return path.length === 5 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'aggregates'
}

function isSortExpressionPath(path: JsonPath): boolean {
  return path.length === 5 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'views' && typeof path[3] === 'string' && path[4] === 'sortExpression'
}

function isTableRelationsPath(path: JsonPath): boolean {
  return path.length === 1 && path[0] === 'tableRelations'
}

function isViewDependenciesPath(path: JsonPath): boolean {
  return path.length === 1 && path[0] === 'viewDependencies'
}

function isApiPath(path: JsonPath): boolean {
  return path.length === 3 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'api'
}

function isBatchApiPath(path: JsonPath): boolean {
  return path.length === 4 && path[0] === 'tables' && typeof path[1] === 'string' && path[2] === 'api' && path[3] === 'batch'
}

// ── 保护 / 可编辑判定 ────────────────────────────────────────

function isProtectedPath(path: JsonPath): boolean {
  return (path.length === 1 && path[0] === 'tables')
    || (path.length === 4
      && path[0] === 'tables'
      && typeof path[1] === 'string'
      && path[2] === 'views'
      && path[3] === 'default')
}

function isProtectedContainerPath(path: JsonPath): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  if (last === 'tables' || last === 'tableRelations' || last === 'viewDependencies'
    || last === 'columns' || last === 'views' || last === 'rows'
    || last === 'sortExpression' || last === 'aggregates'
    || last === 'treeConfig' || last === 'api' || last === 'batch') {
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

function canEditKey(path: JsonPath): boolean {
  if (path.length === 0) return false
  const parentPath = path.slice(0, -1)
  if (isTablesPath(parentPath)) return true
  if (isViewsPath(parentPath)) return path[path.length - 1] !== 'default'
  if (isAggregatesPath(parentPath)) return true
  return false
}

function canEditType(path: JsonPath): boolean {
  if (path.length === 0) return false
  if (isProtectedPath(path)) return false
  if (isProtectedContainerPath(path)) return false
  const parentPath = path.slice(0, -1)
  if (isTableColumnsPath(parentPath) || isTableRelationsPath(parentPath)
    || isViewDependenciesPath(parentPath) || isSortExpressionPath(parentPath)) {
    return false
  }
  return true
}

// ── 默认值工厂 ────────────────────────────────────────────────

const ROOT_TOP_LEVEL_KEYS = ['dataSetName', 'tables', 'tableRelations', 'viewDependencies', 'version', 'pageId'] as const
const CRUD_API_KEYS = ['list', 'retrieve', 'create', 'update', 'delete', 'children', 'path', 'subtree', 'move', 'search', 'nested', 'nestedSearch'] as const
const BATCH_API_KEYS = ['create', 'update', 'delete'] as const

function createDefaultArrayItem(parentPath: JsonPath): JsonValue {
  if (isTableColumnsPath(parentPath)) {
    return { name: 'newField', type: 'string', label: '新字段' }
  }
  if (isTableRelationsPath(parentPath)) {
    return { parentTable: 'ParentTable', childTable: 'ChildTable', parentField: 'id', childField: 'parentId' }
  }
  if (isViewDependenciesPath(parentPath)) {
    return { parentTable: 'ParentTable', childTable: 'ChildTable', dependencyType: 'currentRow', autoLoad: true }
  }
  if (isSortExpressionPath(parentPath)) {
    return { field: 'id', direction: 'asc' }
  }
  if (isRowsPath(parentPath)) {
    return {}
  }
  return ''
}

function createDefaultObjectValue(parentPath: JsonPath, key: string): JsonValue {
  if (parentPath.length === 0) return createDefaultRootEntryValue(key)
  if (isTablesPath(parentPath)) return createDefaultTableMetadata(key)
  if (isViewsPath(parentPath)) return key === 'default' ? {} : { rows: [] }
  if (isAggregatesPath(parentPath)) return { type: 'sum' }
  if (isApiPath(parentPath)) {
    return key === 'batch'
      ? {}
      : { url: '/api/resource', method: key === 'list' ? 'GET' : key === 'delete' ? 'DELETE' : 'POST' }
  }
  if (isBatchApiPath(parentPath)) {
    return { url: '/api/resource', method: key === 'delete' ? 'DELETE' : 'POST' }
  }
  if (isRowsObjectPath(parentPath)) return ''
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
  return { tableName, columns: [], views: { default: {} } }
}

function suggestChildKey(target: JsonObject, parentPath: JsonPath): string {
  const existingKeys = new Set(Object.keys(target))
  const preferredKeys = getPreferredObjectKeys(parentPath)
  for (const candidate of preferredKeys) {
    if (!existingKeys.has(candidate)) return candidate
  }

  if (isTablesPath(parentPath)) return ensureUniqueObjectKey(target, 'NewTable')
  if (isViewsPath(parentPath)) return ensureUniqueObjectKey(target, 'view1')
  if (isAggregatesPath(parentPath)) return ensureUniqueObjectKey(target, 'newAggregate')
  if (isRowsObjectPath(parentPath)) return ensureUniqueObjectKey(target, 'newField')
  return ensureUniqueObjectKey(target, 'newField')
}

function getPreferredObjectKeys(parentPath: JsonPath): string[] {
  if (parentPath.length === 0) return [...ROOT_TOP_LEVEL_KEYS]
  if (isViewsPath(parentPath)) return ['default', 'options', 'detail', 'grid']
  if (isApiPath(parentPath)) return [...CRUD_API_KEYS]
  if (isBatchApiPath(parentPath)) return [...BATCH_API_KEYS]
  return []
}

// ── 导出策略对象 ──────────────────────────────────────────────

export const pageDataPolicy: JsonTreePolicy = {
  rootLabel: 'pagedata',
  isProtected: isProtectedPath,
  canEditKey,
  canEditType,
  suggestChildKey,
  createDefaultArrayItem,
  createDefaultObjectValue,
}
