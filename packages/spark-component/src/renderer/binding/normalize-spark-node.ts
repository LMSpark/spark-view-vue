/**
 * SparkNode v2 → BindRule 归一化
 *
 * 纯映射函数，将 meta.* 展开到现有 BindRule 扁平结构，
 * 使所有下游管线（delegate / 容器组件 / 字段组件）零改动。
 */

import type { BindRule } from '../types'
import type {
  SparkNode,
  SparkNodeSimpleActionsConfig,
} from '../types'
import { setRuleProp } from './bind-helpers'

/** 容器类型 → actions props 键名映射 */
const ACTION_KEY_MAP: Record<string, string> = {
  'r-table': 'rowActions',
  'r-tree': 'nodeActions',
  'r-list': 'itemActions',
}

/** 双区 actions 容器 */
const DUAL_ACTION_TYPES = new Set(['r-dialog', 'r-drawer'])

/**
 * 生命周期/组件特定事件名（需走 props.on* 通道而非 rule.on 通道）
 *
 * 这些事件由容器组件通过 props.onXxx 接收，而不是通过 rule.on 通道。
 */
const LIFECYCLE_EVENTS = new Set([
  'open', 'opened', 'close', 'closed',       // dialog/drawer
  'nodeClick', 'nodeExpand', 'nodeCollapse',  // tree
  'checkChange',                               // tree
  'tabChange', 'tabClick',                     // tabs
  'stepChange',                                // steps
  'change', 'blur', 'focus',                   // fields
])

/**
 * 检测一个规则对象是否为 SparkNode v2 格式
 */
export function isSparkNode(rule: BindRule): boolean {
  return 'meta' in rule && typeof rule['meta'] === 'object' && rule['meta'] !== null
}

/**
 * SparkNode v2 → BindRule 归一化
 */
export function normalizeSparkNode(node: SparkNode): BindRule {
  const rule: BindRule = { type: node.type, props: { ...node.props } }
  if (node.id) rule['id'] = node.id
  if (node.children) {
    rule.children = node.children.map(normalizeSparkNode)
  }

  const m = node.meta
  if (!m) return rule

  // ── data → 顶层 + props ─────────────────────────────────────
  if (m.data) {
    if (m.data.dataKey) rule['dataKey'] = m.data.dataKey
    if (m.data.name) rule.name = m.data.name
    if (m.data.options) setRuleProp(rule, 'options', m.data.options)
    if (m.data.optionLabelField) setRuleProp(rule, 'optionLabelField', m.data.optionLabelField)
    if (m.data.optionValueField) setRuleProp(rule, 'optionValueField', m.data.optionValueField)
    if (m.data.optionChildrenField) setRuleProp(rule, 'optionChildrenField', m.data.optionChildrenField)
  }

  // ── filter → props（独立域） ─────────────────────────────────
  if (m.filter) {
    const f = m.filter
    if (f.columns) setRuleProp(rule, 'filterColumns', f.columns)
    if (f.collapsible !== undefined) setRuleProp(rule, 'filterCollapsible', f.collapsible)
    if (f.defaultCollapsed !== undefined) setRuleProp(rule, 'filterDefaultCollapsed', f.defaultCollapsed)
    if (f.autoFitMinWidth) setRuleProp(rule, 'filterAutoFitMinWidth', f.autoFitMinWidth)
    if (f.itemSpan !== undefined) setRuleProp(rule, 'filterItemSpan', f.itemSpan)
    if (f.gridColumns !== undefined) setRuleProp(rule, 'filterGridColumns', f.gridColumns)
    if (f.gridGap !== undefined) setRuleProp(rule, 'filterGridGap', f.gridGap)
    if (f.gridAutoRows) setRuleProp(rule, 'filterGridAutoRows', f.gridAutoRows)
    if (f.class) setRuleProp(rule, 'filterClass', f.class)
  }

  // ── layout → props ───────────────────────────────────────────
  if (m.layout) {
    if (m.layout.colSpan !== undefined) setRuleProp(rule, 'colSpan', m.layout.colSpan)
    if (m.layout.rowSpan !== undefined) setRuleProp(rule, 'rowSpan', m.layout.rowSpan)
    if (m.layout.grid) {
      if (m.layout.grid.columns !== undefined) setRuleProp(rule, 'gridColumns', m.layout.grid.columns)
      if (m.layout.grid.gap !== undefined) setRuleProp(rule, 'gridGap', m.layout.grid.gap)
      if (m.layout.grid.autoRows) setRuleProp(rule, 'gridAutoRows', m.layout.grid.autoRows)
    }
    if (m.layout.style) setRuleProp(rule, 'style', m.layout.style)
    if (m.layout.class !== undefined) setRuleProp(rule, 'class', m.layout.class)
  }

  // ── toolbar → props ──────────────────────────────────────────
  if (m.toolbar) {
    setRuleProp(rule, 'toolbar', m.toolbar.items.map(normalizeSparkNode))
    if (m.toolbar.position) setRuleProp(rule, 'toolbarPosition', m.toolbar.position)
    if (m.toolbar.class) setRuleProp(rule, 'toolbarClass', m.toolbar.class)
  }

  // ── actions → props（按容器类型分派） ────────────────────────
  if (m.actions) {
    if (DUAL_ACTION_TYPES.has(rule.type)) {
      // 双区模式（r-dialog / r-drawer）
      if ('header' in m.actions || 'footer' in m.actions) {
        const dual = m.actions
        if (dual.header?.items) setRuleProp(rule, 'headerActions', dual.header.items.map(normalizeSparkNode))
        if (dual.footer?.items) setRuleProp(rule, 'footerActions', dual.footer.items.map(normalizeSparkNode))
      } else {
        // 兼容：dialog 若传的是 SimpleActionsConfig → 视为 footerActions
        const simple = m.actions as SparkNodeSimpleActionsConfig
        setRuleProp(rule, 'footerActions', simple.items.map(normalizeSparkNode))
      }
    } else {
      // 简单模式（r-table / r-tree / r-list）
      const simple = m.actions as SparkNodeSimpleActionsConfig
      const actionKey = ACTION_KEY_MAP[rule.type] ?? 'rowActions'
      setRuleProp(rule, actionKey, simple.items.map(normalizeSparkNode))
      if (simple.position) setRuleProp(rule, `${actionKey}Position`, simple.position)
      if (simple.label) setRuleProp(rule, `${actionKey}Label`, simple.label)
      if (simple.width !== undefined) setRuleProp(rule, `${actionKey}Width`, simple.width)
      if (simple.align) setRuleProp(rule, `${actionKey}Align`, simple.align)
      if (simple.fixed !== undefined) setRuleProp(rule, `${actionKey}Fixed`, simple.fixed)
      if (simple.class) setRuleProp(rule, `${actionKey}Class`, simple.class)
    }
  }

  // ── state → 顶层 + props ────────────────────────────────────
  if (m.state) {
    if (m.state.visible !== undefined) rule['visible'] = m.state.visible
    if (m.state.disabled !== undefined) rule['disabled'] = m.state.disabled
    if (m.state.modelValue !== undefined) setRuleProp(rule, 'modelValue', m.state.modelValue)
    if (m.state.collapsed !== undefined) setRuleProp(rule, 'collapsed', m.state.collapsed)
  }

  // ── behavior.on → rule.on + props.on* ───────────────────────
  if (m.behavior?.on) {
    const eventMap: Record<string, string> = {}
    for (const [eventName, fnName] of Object.entries(m.behavior.on)) {
      if (LIFECYCLE_EVENTS.has(eventName)) {
        // 生命周期/组件特定事件 → props.onXxx 通道
        const propName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`
        setRuleProp(rule, propName, fnName)
      } else {
        // 标准 DOM/组件事件 → rule.on 通道
        eventMap[eventName] = fnName
      }
    }
    if (Object.keys(eventMap).length > 0) {
      rule.on = { ...rule.on as Record<string, unknown>, ...eventMap }
    }
  }

  return rule
}
