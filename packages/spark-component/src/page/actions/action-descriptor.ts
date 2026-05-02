/**
 * Action Descriptor — 声明式行为描述符
 *
 * 单一动作真源：rule.json 的 `on` 事件、容器区域子节点（如 `r-toolbar`）、
 * 内置按钮的 `props.action` 全部统一通过此 descriptor 声明，
 * 由 `executeActionDescriptor` 单一执行器消费。
 */

import type { DataView, IDataRow, IDataSet } from '@spark-view/spark-data'
import type { IPageServiceCapability, PageMessageType } from '../../core/capability-system.js'
import type { CancellableControl } from '../../internal/cancellable-control'

// ── 通用装饰：所有 data-mutating 动作共享 ─────────────────────────────────

/**
 * UI 装饰：与具体动作语义无关，统一控制消息/确认/静默。
 * 文案模板支持 `{var}` 插值（执行器在适当时机注入 `count`、`row` 字段等）。
 */
export interface ActionUiDecorator {
  silent?: boolean
  successMessage?: string
  failureMessage?: string
  emptyMessage?: string
  errorMessage?: string
  confirmMessage?: string
  confirmTitle?: string
  confirmType?: PageMessageType
}

// ── 行作用域（执行参数） ──────────────────────────────────────────────────

/** 表单 API（submit-current-form 专用） */
export interface ActionFormApi {
  getCurrentRow(): IDataRow | null
  getFormData(): Record<string, unknown>
  validate?(): Promise<boolean>
}

/**
 * 动作执行作用域：调用方按需挂入。
 * - row：行内动作（target='scope'）的当前行
 * - index：行索引
 * - formApi：仅 submit-current-form 需要
 */
export interface ActionExecutionScope {
  row?: IDataRow
  index?: number
  formApi?: ActionFormApi
}

// ── 类型定义 ──────────────────────────────────────────────────────────────

/** ActionDescriptor 判别联合（合并后 14 类） */
export type ActionDescriptor =
  | ShowMessageAction
  | ShowConfirmAction
  | ShowAlertAction
  | NavigateAction
  | OpenAction
  | SetFieldAction
  | AppendRowAction
  | DeleteAction
  | PatchAction
  | MoveAction
  | MessageRowAction
  | RefreshAction
  | ClearRowsAction
  | SubmitCurrentFormAction

/** ActionDescriptor 的统一动作名集合。 */
export type ActionDescriptorActionName =
  | 'show-message'
  | 'confirm'
  | 'alert'
  | 'navigate'
  | 'open'
  | 'set-field'
  | 'append-row'
  | 'delete'
  | 'patch'
  | 'move'
  | 'message-row'
  | 'refresh'
  | 'clear-rows'
  | 'submit-current-form'

/** 行目标：区分 row 来源 */
export type ActionRowTarget = 'scope' | 'current' | 'selected'

interface ActionDescriptorBase {
  action: ActionDescriptorActionName
  then?: ActionDescriptor
  cancelDefault?: boolean
}

// ── UI 单一动作 ──────────────────────────────────────────────────────────

export interface ShowMessageAction extends ActionDescriptorBase {
  action: 'show-message'
  message: string
  messageType?: PageMessageType
}

export interface ShowConfirmAction extends ActionDescriptorBase {
  action: 'confirm'
  message: string
  title?: string
  confirmType?: PageMessageType
  onConfirm?: ActionDescriptor
  onCancel?: ActionDescriptor
}

export interface ShowAlertAction extends ActionDescriptorBase {
  action: 'alert'
  message: string
  title?: string
}

export interface NavigateAction extends ActionDescriptorBase {
  action: 'navigate'
  /** 目标路径，支持 `{field}` 从事件 row 插值 */
  path: string
}

export interface OpenAction extends ActionDescriptorBase {
  action: 'open'
  target: string
}

export interface SetFieldAction extends ActionDescriptorBase {
  action: 'set-field'
  dataKey?: string
  field: string
  value: unknown
  idField?: string
}

// ── Data-mutating 动作（带 UI 装饰） ─────────────────────────────────────

export interface ActionPromptConfig {
  field: string
  message?: string
  title?: string
  defaultValue?: string
  placeholder?: string
}

export interface AppendRowAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'append-row'
  dataKey?: string
  appendPayload?: Record<string, unknown>
  idField?: string
  inheritFields?: string[]
  inheritFieldMap?: Record<string, string>
  setCurrentRowOnSuccess?: boolean
  /** 启用 prompt 模式：弹窗输入指定字段后再追加 */
  prompt?: ActionPromptConfig
}

export interface DeleteAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'delete'
  target: ActionRowTarget
  dataKey?: string
  idField?: string
}

export interface PatchAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'patch'
  target: ActionRowTarget
  dataKey?: string
  idField?: string
  patch?: Record<string, unknown>
  field?: string
  value?: unknown
  /** prompt 模式：弹窗输入字段值替代静态 patch */
  prompt?: ActionPromptConfig
}

export interface MoveAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'move'
  target: 'scope' | 'current'
  dataKey?: string
  idField?: string
  newParentId?: string | number | null
  targetParentSource?: 'field' | 'scope'
  targetParentField?: string
  index?: number
}

export interface MessageRowAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'message-row'
  target: 'scope' | 'current'
  dataKey?: string
  message?: string
  messageFields?: string[]
  messageType?: PageMessageType
}

export interface RefreshAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'refresh'
  dataKey?: string
}

export interface ClearRowsAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'clear-rows'
  dataKey?: string
}

export interface SubmitCurrentFormAction extends ActionDescriptorBase, ActionUiDecorator {
  action: 'submit-current-form'
  dataKey?: string
  idField?: string
  validateMessage?: string
}

// ── 类型守卫 ──────────────────────────────────────────────────────────────

interface ActionDescriptorShape {
  action: unknown
}

export function isActionDescriptor(value: unknown): value is ActionDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as ActionDescriptorShape).action === 'string'
  )
}

// ── 运行时上下文 ──────────────────────────────────────────────────────────

export interface ActionExecutionContext {
  getDataSet: () => IDataSet | null
  /**
   * 可选：调用方显式提供当前作用域 DataView。
   *
   * 仅用于容器已确定 DataView 的受控场景（如 r-table 内置按钮），
   * 避免在缺少 dataKey 时误报“数据视图未就绪”。
   */
  getDataSource?: () => DataView | null
  getPageService: () => IPageServiceCapability | null
  getRouter: () => RouterLike | null
}

export type ActionExecutionControl = CancellableControl

export interface RouterLike {
  push(to: string | { path: string; query?: Record<string, string> }): unknown
}
