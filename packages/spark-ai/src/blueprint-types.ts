// ── App Blueprint 类型定义（极简版）──────────────────────────────────────
// 核心思想：蓝图 = NavRoot（导航树本身就是应用骨架）
//
// NavRoot — 应用顶层（title / description / version + children）
//   └─ children: NavNode[] — 模块（nodeKind='module'）
//       └─ children: NavNode[] — 页面（nodeKind='page'）
//
// 数据模型（表/关系）→ BlueprintDataModel（独立存储，不嵌入导航树）

import type { DataRelation, ITableOwnMetadata } from '@spark-view/spark-data'
import type { NavNode, NavRoot } from '@spark-view/spark-utils'

// ── 蓝图共享数据模型（项目级，独立于导航树）──────────────────────────────

/**
 * 蓝图级共享数据模型
 *
 * 复用 spark-data 现有类型：
 * - 表结构 = ITableOwnMetadata（tableName + columns: DataColumn[] + api?）
 * - 关系 = DataRelation（parentTable / childTable / parentField / childField）
 *
 * 独立于导航树存储（后端按项目维度管理），不嵌入 NavRoot。
 */
export interface BlueprintDataModel {
  /** 实体表结构（key = tableName）— 直接复用 ITableOwnMetadata */
  tables: Record<string, ITableOwnMetadata>
  /** 表间关系 — 直接复用 DataRelation */
  relations: DataRelation[]
}

// ── 工具函数（操作 NavNode[] 即操作蓝图）───────────────────────────────

/** 递归展平 NavNode 树 */
function flattenNavNodes(nodes: NavNode[]): NavNode[] {
  const result: NavNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children) {
      result.push(...flattenNavNodes(node.children))
    }
  }
  return result
}

/**
 * 获取 NavRoot 中所有页面节点（递归展平）
 *
 * 判定为页面节点：nodeKind='page' | nodeKind='system-page'，或有 path
 */
export function getAllPageNodes(root: NavRoot): NavNode[] {
  return flattenNavNodes(root.children).filter(
    (n) => n.nodeKind === 'page' || n.nodeKind === 'system-page' || n.path !== undefined,
  )
}

/**
 * 获取 NavRoot 中所有模块节点（nodeKind='module'）
 */
export function getAllModuleNodes(root: NavRoot): NavNode[] {
  return flattenNavNodes(root.children).filter((n) => n.nodeKind === 'module')
}

/**
 * 统计蓝图规模（NavRoot + 数据模型）
 */
export function getBlueprintStats(
  root: NavRoot,
  dataModel: BlueprintDataModel,
): {
  moduleCount: number
  pageCount: number
  tableCount: number
  relationCount: number
} {
  return {
    moduleCount: getAllModuleNodes(root).length,
    pageCount: getAllPageNodes(root).length,
    tableCount: Object.keys(dataModel.tables).length,
    relationCount: dataModel.relations.length,
  }
}

/**
 * 解析某个表参与的所有关系
 */
export function resolveTableRelations(
  tableName: string,
  dataModel: BlueprintDataModel,
): DataRelation[] {
  return dataModel.relations.filter(
    (r) => r.parentTable === tableName || r.childTable === tableName,
  )
}

/**
 * 验证 NavRoot（蓝图）+ 数据模型的一致性
 */
export function validateBlueprintTree(
  root: NavRoot,
  dataModel: BlueprintDataModel,
): string[] {
  const errors: string[] = []

  if (!root.title) {
    errors.push('蓝图缺少应用标题（NavRoot.title）')
  }

  const allPages = getAllPageNodes(root)
  if (allPages.length === 0) {
    errors.push('蓝图至少需要一个页面节点')
  }

  // 页面 ID 唯一性（path slug 或 node.id）
  const pageIds = new Set<string>()
  for (const page of allPages) {
    const slug = typeof page.path === 'string' ? page.path.replace(/^\/+/, '').replace(/\/+$/, '') : ''
    const pid = (slug !== '' && !slug.includes('/')) ? slug : page.id
    if (pageIds.has(pid)) {
      errors.push(`页面 ID 重复: ${pid}`)
    }
    pageIds.add(pid)
  }

  const tableNames = new Set(Object.keys(dataModel.tables))

  // 关系引用的表是否存在
  for (const rel of dataModel.relations) {
    if (!tableNames.has(rel.parentTable)) {
      errors.push(`关系引用了不存在的父表: ${rel.parentTable}`)
    }
    if (!tableNames.has(rel.childTable)) {
      errors.push(`关系引用了不存在的子表: ${rel.childTable}`)
    }
  }

  return errors
}
