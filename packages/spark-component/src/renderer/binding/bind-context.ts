/**
 * 规则绑定上下文 — 在递归 bindDataToRules 中逐层传递
 *
 * 功能分区：
 * 1) 上下文模型（BindingContext / EMPTY_CONTEXT）
 * 2) 组件分类（字段提供者 / 数据容器）
 * 3) 子级上下文构建（buildChildContext）
 *
 * 负责将父组件的数据 / 权限 / 字段上下文向子组件传递，使子组件能够：
 * - 继承父级 DataView（如 el-table-column 内的 el-input 继承表格的 DataView）
 * - 知道自己所在的字段名（如 el-table-column[prop="name"] 内的 el-tag）
 * - 继承模型级权限数据（如 el-button 判断是否允许新增 / 导出）
 *
 * 每一层递归生成新的 BindingContext 实例（浅拷贝），
 * 父级信息不可变，子级只会覆盖（不回写）。
 *
 * @example
 * ```
 * el-table (dataKey → DataView)     → parentType='el-table', dataSource=view
 *   └─ el-table-column (prop="status") → fieldName='status'
 *       └─ el-tag                        (inherits DataView + field)
 *       └─ el-input                      (inherits DataView + field → permission-driven disabled)
 * ```
 */

import type { IDataSource, IModelPermission } from '@spark-view/spark-data'

// ── 分区 A：上下文模型 ─────────────────────────────────────────────────────

/**
 * 规则绑定上下文
 *
 * 携带当前递归位置所继承的数据源、字段名和权限信息。
 * 用于子组件推断自身的数据来源和渲染状态。
 */
export interface BindingContext {
  /** 最近父组件类型（undefined 表示顶层） */
  parentType?: string
  /** 继承的数据源（来自最近数据容器组件的 dataKey 解析，DataView 实现 IDataSource） */
  dataSource?: IDataSource | null
  /** 继承的字段名（来自 el-table-column.prop / el-form-item.prop / el-descriptions-item.prop） */
  fieldName?: string
  /** 模型级权限（从 IDataSource._modelPerm 继承） */
  modelPerm?: IModelPermission
}

/** 空上下文（顶层调用或无上下文时使用） */
export const EMPTY_CONTEXT: Readonly<BindingContext> = Object.freeze({})

// ── 分区 B：组件分类 ───────────────────────────────────────────────────────

/** 携带字段名的容器组件类型（prop 属性表示子组件对应的数据字段） */
const FIELD_PROVIDER_TYPES = new Set([
  'el-table-column',
  'el-form-item',
  'el-descriptions-item',
])

/** 数据容器组件类型（dataKey 解析得到的 DataSource 需要向下传递） */
export const DATA_CONTAINER_TYPES = new Set([
  'el-table',
  'el-form',
  'el-descriptions',
])

// ── 分区 C：上下文构建 ─────────────────────────────────────────────────────

/**
 * 根据当前规则构建子级绑定上下文
 *
 * 规则：
 * - 数据容器组件（el-table / el-form / el-descriptions）：更新 dataSource + modelPerm
 * - 字段提供者（el-table-column / el-form-item）：更新 fieldName
 * - 其他组件：透传父级上下文（不修改）
 *
 * @param currentType        当前规则的组件类型
 * @param currentProps       当前规则的 props
 * @param parentContext      父级上下文
 * @param resolvedDataSource 当前规则解析出的 DataSource（仅数据容器组件传入）
 * @returns 子级上下文（无变化时复用父级对象，减少 GC 压力）
 */
export function buildChildContext(
  currentType: string | undefined,
  currentProps: Record<string, unknown> | undefined,
  parentContext: BindingContext,
  resolvedDataSource?: IDataSource | null
): BindingContext {
  let changed = false
  let dataSource = parentContext.dataSource
  let modelPerm = parentContext.modelPerm
  let fieldName = parentContext.fieldName

  // 数据容器组件：更新 dataSource + modelPerm
  if (currentType && DATA_CONTAINER_TYPES.has(currentType) && resolvedDataSource) {
    dataSource = resolvedDataSource
    modelPerm = resolvedDataSource._modelPerm ?? parentContext.modelPerm
    changed = true
  }

  // 字段提供者：提取 prop 作为 fieldName
  if (currentType && FIELD_PROVIDER_TYPES.has(currentType)) {
    const prop = currentProps?.['prop'] as string | undefined
    if (prop) {
      fieldName = prop
      changed = true
    }
  }

  // 无变化：复用父级上下文对象，减少临时对象与 GC 压力
  if (!changed) return parentContext

  // exactOptionalPropertyTypes 要求：optional 属性不能赋值 undefined
  // 只在值非 undefined 时才写入属性
  const child: BindingContext = {}
  if (currentType !== undefined) child.parentType = currentType
  if (dataSource !== undefined) child.dataSource = dataSource
  if (fieldName !== undefined) child.fieldName = fieldName
  if (modelPerm !== undefined) child.modelPerm = modelPerm
  return child
}
