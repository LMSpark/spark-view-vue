/**
 * Action Descriptor — 声明式行为描述符
 *
 * rule.json 中的 `on` 事件 / toolbar / rowActions 均可使用 action descriptor，
 * 替代 script.js 中的函数调用，实现 **配置驱动、零脚本** 的交互逻辑。
 *
 * @example
 * ```jsonc
 * // rule.json — on 事件
 * { "type": "el-button", "on": { "click": { "action": "show-message", "message": "已保存", "messageType": "success" } } }
 *
 * // rule.json — confirm → chain
 * { "on": { "click": { "action": "confirm", "message": "确认删除？", "onConfirm": { "action": "delete-current" } } } }
 *
 * // docked toolbar — prompt → append
 * {
 *   "props": { "docks": { "toolbar": { "position": "top" } } },
 *   "children": [
 *     { "type": "action", "dock": "toolbar", "props": { "builtinAction": "prompt-append", "promptMessage": "请输入名称", "field": "name" } }
 *   ]
 * }
 * ```
 */

import type { IDataSet } from '@spark-view/spark-data'
import type { IPageServiceCapability, PageMessageType } from '@spark-view/spark-utils'
import type { DefaultBehaviorControl } from '../../internal/defaultBehaviorControl'

// ── 类型定义 ──────────────────────────────────────────────────────────────

/**
 * Action Descriptor 判别联合
 *
 * 通过 `action` 字段区分具体行为类型。
 * 所有描述符均可携带 `then` 实现链式执行。
 */
export type ActionDescriptor =
  | ScriptCallAction
  | ShowMessageAction
  | ShowConfirmAction
  | ShowAlertAction
  | NavigateAction
  | AppendRowAction
  | DeleteCurrentAction
  | DeleteSelectedAction
  | RefreshAction
  | PatchCurrentAction
  | SetFieldAction
  | OpenAction

interface ActionDescriptorBase {
  /** 动作类型标识 */
  action: string
  /** 链式：当前动作完成后执行下一个 */
  then?: ActionDescriptor
  /**
   * 取消组件默认行为
   *
   * 为 true 时，容器事件（row-click/selection-change 等）跳过默认的
   * setCurrentRow / setSelectedRows 等同步操作；字段变更事件跳过默认的
   * emit + syncValue。
   *
   * 数组内任一描述符设为 true，则整体取消默认行为。
   */
  cancelDefault?: boolean
}

/** 调用 pageFunctions 中的脚本函数（兼容 script.js 迁移期） */
export interface ScriptCallAction extends ActionDescriptorBase {
  action: 'script'
  /** 函数名 */
  fn: string
}

/** 弹出消息提示 */
export interface ShowMessageAction extends ActionDescriptorBase {
  action: 'show-message'
  message: string
  messageType?: PageMessageType
}

/** 弹出确认框 → 分支执行 */
export interface ShowConfirmAction extends ActionDescriptorBase {
  action: 'confirm'
  message: string
  title?: string
  confirmType?: PageMessageType
  /** 确认后执行 */
  onConfirm?: ActionDescriptor
  /** 取消后执行 */
  onCancel?: ActionDescriptor
}

/** 弹出提示框（纯告知，无分支） */
export interface ShowAlertAction extends ActionDescriptorBase {
  action: 'alert'
  message: string
  title?: string
}

/** 路由导航 */
export interface NavigateAction extends ActionDescriptorBase {
  action: 'navigate'
  /** 目标路径，支持 `{field}` 从 currentRow 插值 */
  path: string
}

/** 追加空行 / 带初始值的行 */
export interface AppendRowAction extends ActionDescriptorBase {
  action: 'append-row'
  /** 指定目标视图（可选，默认取第一个表） */
  dataKey?: string
  /** 初始行数据 */
  payload?: Record<string, unknown>
  /** 主键字段名 */
  idField?: string
}

/** 删除当前行（可带确认） */
export interface DeleteCurrentAction extends ActionDescriptorBase {
  action: 'delete-current'
  dataKey?: string
  confirmMessage?: string
  idField?: string
}

/** 删除已勾选行（可带确认） */
export interface DeleteSelectedAction extends ActionDescriptorBase {
  action: 'delete-selected'
  dataKey?: string
  confirmMessage?: string
  idField?: string
}

/** 刷新数据（远程 API 表） */
export interface RefreshAction extends ActionDescriptorBase {
  action: 'refresh'
  dataKey?: string
}

/** 更新当前行字段 */
export interface PatchCurrentAction extends ActionDescriptorBase {
  action: 'patch-current'
  dataKey?: string
  patch?: Record<string, unknown>
  field?: string
  value?: unknown
  idField?: string
}

/** 设置字段值（通用） */
export interface SetFieldAction extends ActionDescriptorBase {
  action: 'set-field'
  dataKey?: string
  field: string
  value: unknown
  idField?: string
}

/** 打开弹层（dialog/drawer） */
export interface OpenAction extends ActionDescriptorBase {
  action: 'open'
  /** 目标组件 id */
  target: string
}

// ── 类型守卫 ──────────────────────────────────────────────────────────────

/**
 * 判断值是否为 action descriptor 对象
 *
 * 在 normalizeRuleEvents 中用于区分字符串函数名和声明式动作。
 */
export function isActionDescriptor(value: unknown): value is ActionDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['action'] === 'string'
  )
}

// ── 运行时上下文 ──────────────────────────────────────────────────────────

/**
 * Action 执行上下文
 *
 * 由 SparkPageRenderer 在绑定阶段构建，提供 action 执行所需的运行时资源。
 * 所有 getter 延迟求值：action 执行时才解析，适应 DataSet 异步加载。
 */
export interface ActionExecutionContext {
  /** 页面级 DataSet（延迟求值） */
  getDataSet: () => IDataSet | null
  /** UI 消息/确认/输入能力 */
  getPageService: () => IPageServiceCapability | null
  /** 路由推送（框架无关） */
  getRouter: () => RouterLike | null
  /** 调用 script.js 函数（兼容迁移期） */
  callFunc: (name: string, ...args: unknown[]) => unknown
}

/**
 * Action 默认行为控制器
 *
 * 与容器/字段事件的控制对象保持同构：
 * - `cancel = false` → 允许组件默认行为继续执行
 * - `cancel = true`  → 阻止组件默认行为
 */
export type ActionExecutionControl = DefaultBehaviorControl

/** 最小化路由接口，避免直接依赖 vue-router */
export interface RouterLike {
  push(to: string | { path: string; query?: Record<string, string> }): unknown
}
