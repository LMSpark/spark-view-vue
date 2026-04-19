/**
 * Dataset Model — 单一真实源（SSoT）
 *
 * 直接操作 DataSetCrudTool，不重复解析元数据。
 * - DataSetCrudTool 是唯一的数据源
 * - DatasetModel 只负责计算派生数据（快照、摘要、差异）
 * - 避免在上层逐层重复解析和计算
 */

import type { DataSetCrudTool } from '@spark-view/spark-data'

// ═══════════════════════════════════════════════════════════
// Types (仅定义，数据源唯一指向 DataSetCrudTool)
// ═══════════════════════════════════════════════════════════

export interface DatasetModelSnapshot {
  tableNames: string[]
  tableColumns: Record<string, string[]>
  tableViews: Record<string, string[]>
  tableRelations: Record<string, string[]>
  allRelationKeys: string[]
  allDependencyKeys: string[]
}

export interface DatasetModelSummary {
  tables: number
  columns: number
  relations: number
  dependencies: number
  views: number
}

export interface DatasetModelDelta {
  addedTables: string[]
  removedTables: string[]
  changedTables: Array<{
    tableName: string
    addedColumns: string[]
    removedColumns: string[]
    addedViews: string[]
    removedViews: string[]
    addedRelations: string[]
    removedRelations: string[]
  }>
  addedRelations: string[]
  removedRelations: string[]
  addedDependencies: string[]
  removedDependencies: string[]
}

// ═══════════════════════════════════════════════════════════
// DatasetModel 类 — SSoT（直接操作 DataSetCrudTool）
// ═══════════════════════════════════════════════════════════

export class DatasetModel {
  /**
   * 唯一的数据源：DataSetCrudTool
   * 所有数据都从这里读取，不在其他地方重复解析
   */
  private tool: DataSetCrudTool
  private _cachedSnapshot: DatasetModelSnapshot | null = null

  /**
   * 从 DataSetCrudTool 创建模型
   * （这是唯一的构造方式，强制数据源统一）
   */
  constructor(tool: DataSetCrudTool) {
    this.tool = tool
  }

  /**
   * 获取快照（从 tool.toJson() 一次计算，然后缓存）
   * 不会重复解析元数据
   */
  get snapshot(): DatasetModelSnapshot {
    this._cachedSnapshot ??= this._buildSnapshot()
    return this._cachedSnapshot
  }

  /**
   * 获取摘要（从快照计算，不重复）
   */
  getSummary(): DatasetModelSummary {
    const snap = this.snapshot
    const columns = Object.values(snap.tableColumns).reduce((sum, names) => sum + names.length, 0)
    const views = Object.values(snap.tableViews).reduce((sum, names) => sum + names.length, 0)
    return {
      tables: snap.tableNames.length,
      columns,
      relations: snap.allRelationKeys.length,
      dependencies: snap.allDependencyKeys.length,
      views,
    }
  }

  /**
   * 与另一个模型比较，得到增删改统计
   */
  diff(other: DatasetModel): DatasetModelDelta {
    return this._computeDelta(this.snapshot, other.snapshot)
  }

  /**
   * 与一个冻结的快照比较，得到增删改统计
   * 用于 baseline vs current 的对比（baseline 是冻结快照）
   */
  diffSnapshot(baselineSnapshot: DatasetModelSnapshot): DatasetModelDelta {
    return this._computeDelta(baselineSnapshot, this.snapshot)
  }

  /**
   * 获取所有表名
   */
  getTableNames(): string[] {
    return this.snapshot.tableNames
  }

  /**
   * 获取特定表的所有关系
   */
  getTableRelations(tableName: string): string[] {
    return this.snapshot.tableRelations[tableName] ?? []
  }

  // ═══════════════════════════════════════════════════════════
  // 内部实现（私有，数据源来自 tool）
  // ═══════════════════════════════════════════════════════════

  private _sortedUnique(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
  }

  private _relationKey(parentTable: string, childTable: string, parentField: string, childField: string): string {
    return `${parentTable}.${parentField}->${childTable}.${childField}`
  }

  /**
   * 从 DataSetCrudTool.toJson() 一次性构建快照
   * 数据源明确，避免多处解析
   */
  private _buildSnapshot(): DatasetModelSnapshot {
    const metadata = this.tool.toJson()
    const tableNames = this._sortedUnique(Object.keys(metadata.tables))
    const tableColumns: Record<string, string[]> = {}
    const tableViews: Record<string, string[]> = {}

    // 提取表-列 和 表-视图 映射（直接从元数据）
    for (const tableName of tableNames) {
      const table = metadata.tables[tableName]
      if (!table) continue

      const columns = table.columns.map((col) => String(col.name)).filter((name) => name.length > 0)
      tableColumns[tableName] = this._sortedUnique(columns)

      const views = Object.keys(table.views)
      tableViews[tableName] = this._sortedUnique(views)
    }

    // 构建关系键（只有一个地方生成，直接从元数据）
    const allRelationKeys: string[] = []
    const tableRelations: Record<string, string[]> = {}

    for (const tableName of tableNames) {
      tableRelations[tableName] = []
    }

    for (const rel of metadata.tableRelations ?? []) {
      const parentField = rel.parentField ?? 'id'
      const childField = rel.childField ?? '*'
      const key = this._relationKey(rel.parentTable, rel.childTable, parentField, childField)

      allRelationKeys.push(key)
      tableRelations[rel.parentTable]?.push(key)
      tableRelations[rel.childTable]?.push(key)
    }

    // 排序去重
    for (const tableName of tableNames) {
      tableRelations[tableName] = this._sortedUnique(tableRelations[tableName] ?? [])
    }

    const allRelationKeysSorted = this._sortedUnique(allRelationKeys)

    // 构建依赖键（直接从元数据）
    const allDependencyKeys = this._sortedUnique(
      (metadata.viewDependencies ?? []).map((dep) => {
        const depType = dep.dependencyType ?? 'currentRow'
        return `${dep.parentTable}->${dep.childTable}#${depType}`
      })
    )

    return {
      tableNames,
      tableColumns,
      tableViews,
      tableRelations,
      allRelationKeys: allRelationKeysSorted,
      allDependencyKeys,
    }
  }

  private _diffArrays(before: string[], after: string[]): { added: string[]; removed: string[] } {
    const beforeSet = new Set(before)
    const afterSet = new Set(after)
    return {
      added: after.filter((item) => !beforeSet.has(item)),
      removed: before.filter((item) => !afterSet.has(item)),
    }
  }

  private _computeDelta(before: DatasetModelSnapshot, after: DatasetModelSnapshot): DatasetModelDelta {
    const tableDiff = this._diffArrays(before.tableNames, after.tableNames)
    const beforeTableSet = new Set(before.tableNames)
    const sharedTables = after.tableNames.filter((name) => beforeTableSet.has(name))

    const changedTables = sharedTables
      .map((tableName) => {
        const colDiff = this._diffArrays(
          before.tableColumns[tableName] ?? [],
          after.tableColumns[tableName] ?? []
        )
        const viewDiff = this._diffArrays(
          before.tableViews[tableName] ?? [],
          after.tableViews[tableName] ?? []
        )
        const relDiff = this._diffArrays(
          before.tableRelations[tableName] ?? [],
          after.tableRelations[tableName] ?? []
        )

        if (
          colDiff.added.length === 0 &&
          colDiff.removed.length === 0 &&
          viewDiff.added.length === 0 &&
          viewDiff.removed.length === 0 &&
          relDiff.added.length === 0 &&
          relDiff.removed.length === 0
        ) {
          return null
        }

        return {
          tableName,
          addedColumns: colDiff.added,
          removedColumns: colDiff.removed,
          addedViews: viewDiff.added,
          removedViews: viewDiff.removed,
          addedRelations: relDiff.added,
          removedRelations: relDiff.removed,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.tableName.localeCompare(b.tableName))

    const relationDiff = this._diffArrays(before.allRelationKeys, after.allRelationKeys)
    const dependencyDiff = this._diffArrays(before.allDependencyKeys, after.allDependencyKeys)

    return {
      addedTables: tableDiff.added,
      removedTables: tableDiff.removed,
      changedTables,
      addedRelations: relationDiff.added,
      removedRelations: relationDiff.removed,
      addedDependencies: dependencyDiff.added,
      removedDependencies: dependencyDiff.removed,
    }
  }
}

