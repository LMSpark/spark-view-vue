/**
 * 规则归一化工具
 *
 * 从 SparkNode 原始配置中提取/转换事件处理器、Props 回调和结构化容器字段。
 * 被 bindDataToRules（旧绑定管线）和 bindSparkRuleEvents（生产管线）共用。
 *
 * 职责分区：
 * 1) 事件归一化（normalizeRuleEvents / normalizeOnProps）
 * 2) 容器结构扁平化（unpackContainerStructures）— 配置驱动，OCP
 * 3) v2→v3 兼容迁移（migrateNameToField / migrateRootLevelStyleClass）
 */

import type { BindRule } from '../types'
import { setRuleProp, pageLogger } from './bind-helpers'
import { isActionDescriptor, executeActionDescriptor } from '../actions'
import type { ActionExecutionContext } from '../actions'

/** 沙箱函数调用签名（bindRules.ts 中 createFunctionCaller 的返回类型） */
type CallFunc = (functionName: string, ...args: unknown[]) => unknown

// ── 分区 A：事件归一化 ─────────────────────────────────────────────────────

/**
 * 将事件记录中的 handler 归一化为可执行闭包
 *
 * 支持四种 handler 形式：
 * - string → callFunc 闭包（脚本函数名）
 * - { action: "..." } → executeActionDescriptor 闭包（声明式动作）
 * - Array<string | ActionDescriptor | Function> → 逐项包装
 * - Function → 透传
 *
 * @param actionCtx 可选 — 传入时启用 action descriptor 支持（SparkPageRenderer 提供）
 */
function normalizeRuleEvents(
  on: Record<string, unknown>,
  callFunc: CallFunc,
  actionCtx?: ActionExecutionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [eventName, handler] of Object.entries(on)) {
    if (typeof handler === 'string') {
      result[eventName] = (...args: unknown[]) => callFunc(handler, ...args)
    } else if (actionCtx && isActionDescriptor(handler)) {
      const descriptor = handler
      const ctx = actionCtx
      result[eventName] = (...args: unknown[]) => {
        void executeActionDescriptor(descriptor, ctx, args)
      }
    } else if (Array.isArray(handler)) {
      const items = handler as unknown[]
      result[eventName] = items.map((item: unknown) => {
        if (typeof item === 'string') {
          return (...args: unknown[]) => callFunc(item, ...args)
        }
        if (actionCtx && isActionDescriptor(item)) {
          const descriptor = item
          const ctx = actionCtx
          return (...args: unknown[]) => {
            void executeActionDescriptor(descriptor, ctx, args)
          }
        }
        return item
      })
    } else {
      result[eventName] = handler
    }
  }
  return result
}

/**
 * 将 props 中 on* 开头的值包装为闭包（就地修改）
 *
 * 支持两种值形式：
 * - string → callFunc 闭包（脚本函数名）
 * - { action: "..." } → executeActionDescriptor 闭包（声明式动作）
 *
 * 适用于自定义组件（如 r-tree）通过 props 传递事件回调的场景。
 *
 * @param actionCtx 可选 — 传入时启用 action descriptor 支持
 */
function normalizeOnProps(
  props: Record<string, unknown>,
  callFunc: CallFunc,
  actionCtx?: ActionExecutionContext,
): void {
  for (const [key, value] of Object.entries(props)) {
    if (!key.startsWith('on')) continue
    if (typeof value === 'string') {
      props[key] = (...args: unknown[]) => callFunc(value, ...args)
    } else if (actionCtx && isActionDescriptor(value)) {
      const descriptor = value
      const ctx = actionCtx
      props[key] = (...args: unknown[]) => {
        void executeActionDescriptor(descriptor, ctx, args)
      }
    }
  }
}

// ── 分区 B：容器结构扁平化（配置驱动，OCP） ──────────────────────────────

/**
 * 容器结构字段映射声明
 *
 * 新增容器结构时只需在 CONTAINER_STRUCTS 追加配置，
 * 无需修改 unpackContainerStructures 函数本身（开闭原则）。
 */
interface ContainerStructField {
  /** 源对象中的属性名 */
  source: string
  /** 目标 rule.props 中的属性名 */
  target: string
  /** true = 仅当值为数组时才转移 */
  arrayOnly?: boolean
}

interface ContainerStructConfig {
  /** rule 根级的键名（如 'toolbar'） */
  key: string
  /** 字段映射列表 */
  fields: ContainerStructField[]
}

const LEGACY_TOOLBAR_ROOT_CONTAINER_TYPES = new Set(['r-table', 'r-form', 'r-detail', 'r-list', 'r-tree', 'r-tabs', 'r-collapse', 'r-steps'])

/**
 * 容器结构配置表
 *
 * 每项描述一个根级结构化对象如何扁平化为 props。
 * 扩展点：新增容器结构只需在此数组末尾追加。
 */
const CONTAINER_STRUCTS: readonly ContainerStructConfig[] = [
  {
    key: 'filter',
    fields: [
      { source: 'columns', target: 'filterColumns', arrayOnly: true },
      { source: 'class', target: 'filterClass' },
      { source: 'collapsible', target: 'filterCollapsible' },
      { source: 'defaultCollapsed', target: 'filterDefaultCollapsed' },
      { source: 'autoFitMinWidth', target: 'filterAutoFitMinWidth' },
      { source: 'itemSpan', target: 'filterItemSpan' },
      { source: 'gridColumns', target: 'filterGridColumns' },
      { source: 'gridGap', target: 'filterGridGap' },
      { source: 'gridAutoRows', target: 'filterGridAutoRows' },
    ],
  },
  {
    key: 'actions',
    fields: [
      { source: 'items', target: 'rowActions', arrayOnly: true },
      { source: 'position', target: 'rowActionsPosition' },
      { source: 'class', target: 'rowActionsClass' },
      { source: 'label', target: 'rowActionsLabel' },
      { source: 'width', target: 'rowActionsWidth' },
      { source: 'align', target: 'rowActionsAlign' },
      { source: 'fixed', target: 'rowActionsFixed' },
    ],
  },
]

/**
 * 将 r-* 组件根级结构化字段（filter / actions）扁平化到 props
 *
 * rule.json 中容器结构为根级对象，扁平化使组件通过 Vue Props 直接接收。
 * 配置驱动：新增结构类型只需扩展 CONTAINER_STRUCTS，不修改本函数。
 */
function unpackContainerStructures(rule: BindRule): void {
  assertNoLegacyToolbarRoot(rule)

  for (const struct of CONTAINER_STRUCTS) {
    const raw = rule[struct.key]
    if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) continue
    const obj = raw as Record<string, unknown>

    for (const field of struct.fields) {
      const value = obj[field.source]
      if (value === undefined) continue
      if (field.arrayOnly && !Array.isArray(value)) continue
      setRuleProp(rule, field.target, value)
    }
  }
}

function assertNoLegacyToolbarRoot(rule: BindRule): void {
  if (!LEGACY_TOOLBAR_ROOT_CONTAINER_TYPES.has(rule.type)) return

  const rawToolbar = rule['toolbar']
  if (rawToolbar === null || rawToolbar === undefined) return
  if (typeof rawToolbar !== 'object' || Array.isArray(rawToolbar)) return

  throw new Error(
    `[bindRules] ${rule.type} 已废除根级 toolbar 配置。请将工具栏项移动到 children，并为每个节点声明 dock: "toolbar"；位置与样式请改为 props.docks.toolbar。`,
  )
}

// ── 分区 C：v2→v3 兼容迁移 ───────────────────────────────────────────────

/**
 * v2→v3 字段名迁移：将根级 `name` 属性迁移到 `field`
 *
 * v2 配置使用 `name` 作为字段绑定名，v3 统一为 `field`。
 * DEV 环境下输出弃用警告。
 *
 * @deprecated v3.1 — 计划在 v4.0 移除
 */
function migrateNameToField(rule: BindRule): void {
  if (rule.field !== undefined) return
  const nameVal = rule['name']
  if (typeof nameVal !== 'string') return
  if (import.meta.env.DEV) {
    pageLogger.warn(
      `[v2→v3] 规则 "${rule.type}" 的 'name' 属性已弃用，请改用 'field'。当前 name="${nameVal}"`,
    )
  }
  rule.field = nameVal
}

/**
 * 旧格式兼容：将根级 style / class 提升到 props
 *
 * SparkNode v2 允许 style / class 写在规则顶层（与 type 同级）；
 * v3 统一收入 props。仅在 props 中未声明同名属性时才提升。
 *
 * @deprecated v3.1 — 计划在 v4.0 移除
 */
function migrateRootLevelStyleClass(rule: BindRule): void {
  if (rule['style'] !== undefined && rule.props?.['style'] === undefined) {
    setRuleProp(rule, 'style', rule['style'])
  }
  if (rule['class'] !== undefined && rule.props?.['class'] === undefined) {
    setRuleProp(rule, 'class', rule['class'])
  }
}

export {
  normalizeRuleEvents,
  normalizeOnProps,
  unpackContainerStructures,
  migrateNameToField,
  migrateRootLevelStyleClass,
}
