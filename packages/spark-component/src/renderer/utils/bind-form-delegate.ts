/**
 * 值型表单组件规则绑定委托
 *
 * 覆盖 Element Plus 全部值型表单组件：
 *  - 选项类：el-select / el-radio-group / el-checkbox-group / el-cascader / el-tree-select
 *  - 文本类：el-input / el-textarea / el-input-number / el-autocomplete
 *  - 开关类：el-switch
 *  - 滑块类：el-slider / el-rate
 *  - 日期类：el-date-picker / el-time-picker / el-time-select
 *  - 其他：el-color-picker / el-transfer
 *
 * 职责：
 *  - 选项映射：DataView.rows + valueField / labelField → options 数组
 *  - 值绑定：DataView.value ↔ modelValue（按组件类型自动适配：string / boolean / array）
 *  - 事件注入：change → DataView.value setter
 *
 * 配置示例（rule.json）：
 * ```json
 * {
 *   "type": "el-select",
 *   "dataKey": "Categories@rows",
 *   "props": { "valueField": "id", "labelField": "name" }
 * }
 * ```
 *
 * 权限渲染由 bind-permission-delegate 负责（分离关注点）。
 */

import type { BindRule } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import type { DataView } from '@spark-view/spark-data'
import { isDataKey, getViewFromRawKey } from '@spark-view/spark-data'
import { setRuleProp, resolveRuleDataKey, pageLogger } from './bind-helpers'
import { wrapEvent } from './wrapEvent'

// ── 组件分类 ──────────────────────────────────────────────────────────────

/**
 * 全部值型表单组件（持有 modelValue 的组件）
 *
 * 同时包含 form-create 类型别名（'select', 'radio'）以保持向后兼容。
 * 新增表单组件时在此添加。
 */
export const FORM_ELEMENT_TYPES = new Set([
  // form-create 类型别名（向后兼容）
  'select', 'radio',
  // Element Plus 官方类型
  'el-input', 'el-textarea', 'el-input-number', 'el-autocomplete',
  'el-select', 'el-cascader', 'el-tree-select',
  'el-radio-group', 'el-checkbox-group',
  'el-switch', 'el-slider', 'el-rate',
  'el-date-picker', 'el-time-picker', 'el-time-select',
  'el-color-picker', 'el-transfer',
])

/** 选项类组件（需要从 DataView.rows 映射 options） */
const OPTIONS_TYPES = new Set([
  'select', 'radio',
  'el-select', 'el-radio-group', 'el-checkbox-group',
  'el-cascader', 'el-tree-select',
])

/** 多值组件（modelValue 为数组） */
const MULTI_VALUE_TYPES = new Set(['el-checkbox-group', 'el-transfer'])

/** 布尔值组件 */
const BOOLEAN_TYPES = new Set(['el-switch'])

// ── 公共入口 ──────────────────────────────────────────────────────────────

/**
 * 为值型表单组件绑定 dataKey → modelValue / options / events
 *
 * 仅处理具有 dataKey 且在 FORM_ELEMENT_TYPES 中的组件。
 * 不具有 dataKey 的表单组件由 form-create 原生值系统管理。
 */
export function bindFormElementRule(
  rule: BindRule,
  dataSet: IDataSet | null,
): void {
  const type = rule.type
  if (!FORM_ELEMENT_TYPES.has(type)) return

  const rawKey = rule['dataKey'] as string | undefined
  if (!rawKey || !isDataKey(rawKey) || !dataSet) return

  const view = getViewFromRawKey(rawKey, dataSet)

  // ── 1. 选项映射（el-select / el-radio-group / el-checkbox-group / el-cascader） ──
  if (OPTIONS_TYPES.has(type)) {
    let mapped = false
    if (view) {
      const options = mapOptionsFromView(view, rule)
      if (options) {
        // form-create 读取 rule.options，不是 rule.props.options
        rule['options'] = options
        mapped = true
      }
    }
    // 回退：直接解析 dataKey 为数组（兼容已有 { value, label } 格式的数据）
    if (!mapped) {
      const resolved = resolveRuleDataKey(rawKey, dataSet)
      if (Array.isArray(resolved)) {
        rule['options'] = resolved
      }
    }
  }

  // ── 2. 值绑定 + DataView 注入 ──
  if (view) {
    setRuleProp(rule, 'dataView', view)
    // bindValue 默认 true（有 dataKey 即意味着全量数据绑定），可设为 false 禁用
    if (rule.props?.['bindValue'] !== false) {
      injectValueBinding(rule, view, type)
    }
  }
}

// ── 选项映射 ──────────────────────────────────────────────────────────────

/**
 * 从 DataView 行数据映射 el-select / el-radio-group / el-checkbox-group 选项
 *
 * 字段名优先级：rule.props 配置 > DataView 属性 > 行内 value/label 键
 *
 * @returns 映射后的选项数组，或 null（不适合映射时由调用方回退）
 */
function mapOptionsFromView(
  view: DataView,
  rule: BindRule
): Array<{ value: unknown; label: string }> | null {
  const rows = view.rows
  if (!Array.isArray(rows) || rows.length === 0) return null

  // 字段名优先级：rule.props 配置 > DataView 属性 > 行内 value/label 键
  const vf = (rule.props?.['valueField'] as string | undefined)
    ?? (typeof view.valueField === 'string' ? view.valueField : undefined)
  const lf = (rule.props?.['labelField'] as string | undefined)
    ?? view.labelField

  // 行已经是 { value, label } 格式 → 直接使用（无需映射）
  const firstRow = rows[0]
  if (!vf && firstRow && 'value' in firstRow && 'label' in firstRow) {
    return null
  }

  if (!vf) return null

  return rows.map(row => ({
    value: row[vf],
    label: String(lf ? (row[lf] ?? row[vf] ?? '') : (row[vf] ?? '')),
  }))
}

// ── 值绑定 ─────────────────────────────────────────────────────────────────

/**
 * 注入 DataView.value ←→ modelValue 双向绑定 + change 事件
 *
 * 按组件类型自动适配值类型：
 *  - el-switch → boolean（'true'|'1' = true）
 *  - el-checkbox-group / el-transfer → string[]（按 selectionDelimiter 拆分）
 *  - 其他 → string
 */
function injectValueBinding(rule: BindRule, view: DataView, type: string): void {
  rule.props ??= {}

  // ── getter：DataView.value → modelValue（响应式 getter，form-create 每次渲染时读取） ──
  if (BOOLEAN_TYPES.has(type)) {
    Object.defineProperty(rule.props, 'modelValue', {
      get: () => view.value === 'true' || view.value === '1',
      enumerable: true,
      configurable: true,
    })
  } else if (MULTI_VALUE_TYPES.has(type)) {
    const delimiter = view.selectionDelimiter || ','
    Object.defineProperty(rule.props, 'modelValue', {
      get: () => (view.value ? view.value.split(delimiter) : []),
      enumerable: true,
      configurable: true,
    })
  } else {
    Object.defineProperty(rule.props, 'modelValue', {
      get: () => view.value,
      enumerable: true,
      configurable: true,
    })
  }

  // ── setter：change 事件 → DataView.value ──
  wrapEvent(rule, 'change', (val: unknown) => {
    if (MULTI_VALUE_TYPES.has(type) && Array.isArray(val)) {
      view.value = val.join(view.selectionDelimiter || ',')
    } else if (BOOLEAN_TYPES.has(type)) {
      view.value = (val === true || val === 1) ? '1' : '0'
    } else {
      view.value = String(val ?? '')
    }

    pageLogger.debug('[FormEvent] change', { type, value: view.value })
  })
}
