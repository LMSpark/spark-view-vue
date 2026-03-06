/**
 * 权限渲染规则绑定委托
 *
 * 职责：根据 IModelPermission / IInstancePermission 数据驱动 el-* 组件的渲染状态
 *
 * 权限层级：
 *  1. 模型级（_modelPerm）：控制 el-button 等操作组件的可见性（新增 / 导入 / 导出）
 *  2. 实例级（currentRow._perm）：控制表单字段的可编辑性 / 可见性
 *  3. 列级（el-table-column）：整列隐藏（当权限声明该字段 hidden 时）
 *
 * 设计约束：
 *  - 静态规则绑定只能处理「规则级」权限（bindDataToRules 时一次性确定）
 *  - 表格内 per-row 权限差异由组件渲染层（scoped slot / formatter）处理
 *  - 本模块直接读取 _perm / _modelPerm 数据，不依赖 PermissionChecker 类
 *
 * 配置示例（rule.json）：
 * ```json
 * {
 *   "type": "el-button",
 *   "props": { "permAction": "create" },
 *   "children": ["新增"]
 * }
 * ```
 * 当 _modelPerm.allowCreate === false 时，按钮将被隐藏。
 */

import type { BindRule } from '../types'
import type { IModelPermission } from '@spark-view/spark-data'
import { setRuleProp, pageLogger } from './bind-helpers'
import { FORM_ELEMENT_TYPES } from './bind-form-delegate'
import type { BindingContext } from './bind-context'

// ── 操作按钮权限映射 ─────────────────────────────────────────────────────

/**
 * permAction → _modelPerm 字段映射
 *
 * el-button 通过 `props.permAction` 声明所需权限：
 * ```json
 * { "type": "el-button", "props": { "permAction": "create" } }
 * ```
 */
const PERM_ACTION_MAP: Record<string, keyof IModelPermission> = {
  create: 'allowCreate',
  import: 'allowImport',
  export: 'allowExport',
}

/** 操作组件类型（支持按钮和链接） */
const ACTION_TYPES = new Set(['el-button', 'el-link'])

/** 列级容器类型（检查字段权限） */
const COLUMN_LIKE_TYPES = new Set(['el-table-column', 'el-descriptions-item'])

// ── 公共入口 ──────────────────────────────────────────────────────────────

/**
 * 对规则应用权限渲染逻辑
 *
 * 调用时机：在类型特定委托（table / form / pagination）之后，对所有规则统一执行。
 * 幂等：多次调用不会产生副作用。
 *
 * @param rule    当前规则节点
 * @param context 绑定上下文（含 modelPerm / dataSource / fieldName）
 */
export function applyPermissions(rule: BindRule, context: BindingContext): void {
  const type = rule.type
  if (!type) return

  // 组件类型互斥：一个组件只属于一种权限类别
  if (ACTION_TYPES.has(type)) {
    applyButtonPermission(rule, context)
  } else if (COLUMN_LIKE_TYPES.has(type)) {
    applyColumnPermission(rule, context)
  } else if (FORM_ELEMENT_TYPES.has(type)) {
    applyFormFieldPermission(rule, context)
  }
}

// ── 操作按钮权限 ─────────────────────────────────────────────────────────

/**
 * el-button / el-link：根据 permAction 控制可见性
 *
 * 当 _modelPerm 中对应的权限字段为 false 时，设置 `display: 'none'` 隐藏组件。
 */
function applyButtonPermission(rule: BindRule, context: BindingContext): void {
  const action = rule.props?.['permAction'] as string | undefined
  if (!action) return

  const permField = PERM_ACTION_MAP[action]
  if (!permField) {
    pageLogger.warn(
      `[Permission] 未知的 permAction: "${action}"，有效值: ${Object.keys(PERM_ACTION_MAP).join(', ')}`
    )
    return
  }

  const modelPerm = context.modelPerm
  if (!modelPerm) return

  // 权限字段明确为 false → 隐藏组件（display 为 Boolean 类型）
  if (modelPerm[permField] === false) {
    rule['display'] = false
    pageLogger.debug('[Permission] 操作按钮隐藏', { action, permField })
  }
}

// ── 列级字段权限 ─────────────────────────────────────────────────────────

/**
 * el-table-column / el-descriptions-item：根据实例级权限隐藏整列
 *
 * 策略：从 dataSource.currentRow 或首行的 _perm 读取 hiddenFields，
 * 如果当前列的字段在 hiddenFields 中，隐藏该列。
 *
 * ⚠️ 这是一个「合理近似」：表格 per-row 权限可能不同，但列级隐藏只能一刀切。
 * 不同行有不同 hiddenFields 时，应使用 model 级权限控制。
 */
function applyColumnPermission(rule: BindRule, context: BindingContext): void {
  const field = rule.props?.['prop'] as string | undefined
  if (!field) return

  const { dataSource } = context
  if (!dataSource) return

  // 优先检查 currentRow 的隐藏字段（表单 / 详情上下文）
  const currentRow = dataSource.currentRow
  if (currentRow?._perm?.hiddenFields?.includes(field)) {
    rule['display'] = false
    return
  }

  // 回退检查首行（表格上下文 — 首行作为代表行判断列级可见性）
  const firstRow = dataSource.rows?.[0]
  if (firstRow?._perm?.hiddenFields?.includes(field)) {
    rule['display'] = false
  }
}

// ── 表单字段权限 ─────────────────────────────────────────────────────────

/**
 * 表单元素：根据 currentRow._perm 控制 disabled / hidden
 *
 * 仅在以下条件同时满足时生效：
 * 1. 上下文提供了 fieldName（来自 el-form-item.prop）
 * 2. 上下文提供了 dataSource.currentRow（来自 el-form 的 DataView）
 * 3. currentRow 携带 _perm 权限快照
 *
 * ⚠️ el-table 内的表单元素由 scoped slot 处理（per-row），此处跳过。
 */
function applyFormFieldPermission(rule: BindRule, context: BindingContext): void {
  const { fieldName, dataSource, parentType } = context
  if (!fieldName || !dataSource) return

  // el-table-column 内的表单元素：权限是 per-row 的，无法在静态规则层应用
  if (parentType === 'el-table-column') return

  const currentRow = dataSource.currentRow
  if (!currentRow?._perm) return

  const perm = currentRow._perm

  // 字段隐藏
  if (perm.hiddenFields?.includes(fieldName)) {
    rule['display'] = false
    return
  }

  // 字段不可编辑 → disabled
  // 仅当 editableFields 明确存在（服务端声明了可编辑白名单）且不包含当前字段时禁用
  if (perm.editableFields && !perm.editableFields.includes(fieldName)) {
    setRuleProp(rule, 'disabled', true)
  }
}
