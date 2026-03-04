/**
 * 规则绑定主编排器
 *
 * 职责：递归遍历 rule 树，根据组件类型委托给对应的绑定委托：
 *  - el-table        → bind-table-delegate（数据 + 事件 + 加载状态）
 *  - el-pagination   → bind-pagination-delegate（分页双向绑定）
 *  - 值型表单组件    → bind-form-delegate（选项映射 + 值绑定）
 *  - 权限渲染        → bind-permission-delegate（跨组件统一：按钮 / 列 / 字段级）
 *  - r-* 自定义组件  → 透传 dataKey 到 props（组件自行 consume 处理）
 *
 * 上下文传递：
 *  每层递归维护 BindingContext（父组件类型 / DataSource / 字段名 / 模型权限），
 *  子组件通过上下文继承数据源和权限信息，实现「依据父组件类型适应」的智能渲染。
 *
 * 数据流：rule.json → bindDataToRules() → form-create 可渲染的 Rule[]
 */

import { toErrorMessage } from '@spark-view/spark-utils'
import type { Rule, RuleBindingOptions } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { isDataKey, resolveDataKeyBinding, getViewFromRawKey, normalizeDataKey } from '@spark-view/spark-data'
import type { ComponentRegistry } from '../../core/types.js'

// ── 委托模块 ──────────────────────────────────────────────────────────────

import { resolveRuleDataKey, setRuleProp, pageLogger } from './bind-helpers'
import { bindTableRule } from './bind-table-delegate'
import { bindPaginationRule } from './bind-pagination-delegate'
import { bindFormElementRule, FORM_ELEMENT_TYPES } from './bind-form-delegate'
import { applyPermissions } from './bind-permission-delegate'
import { type BindingContext, EMPTY_CONTEXT, buildChildContext, DATA_CONTAINER_TYPES } from './bind-context'

// ── 组件分类常量 ──────────────────────────────────────────────────────────

/**
 * dataKey 自解析组件类型回退默认列表
 *
 * **技术债（临时桥梁）**：当组件没有在注册表中声明 `meta.dataKey` 时，回退到此硬编码列表。
 * 待内置 SPARK r-* 组件实现后，将在注册时声明 `meta.dataKey: 'self-resolve'`，届时可移除此列表。
 *
 * ⚠️ 同步约束：此 Set 必须与实际内置组件列表同步。新增 r-* 组件时：
 * 1. 优先在组件注册时声明 `meta: { dataKey: 'self-resolve' }`
 * 2. 若组件尚未实现注册逻辑，在此 Set 中添加条目作为过渡
 *
 * @see isSelfResolvingType — 查询逻辑（注册表优先，此 Set 为后备）
 */
const _SELF_RESOLVING_FALLBACK = new Set(['r-table', 'r-form', 'r-detail', 'r-tree'])

/** 分页组件类型集合 */
const PAGINATION_TYPES = new Set(['el-pagination'])

// ── 类型判断 ──────────────────────────────────────────────────────────────

/**
 * 检查组件是否为自解析类型（优先查询注册表 meta，回退到核心列表）
 */
function isSelfResolvingType(type: string, registry?: ComponentRegistry): boolean {
  if (registry?.has(type)) {
    const behavior = registry.get(type)?.meta?.['dataKey'] as string | undefined
    if (behavior !== undefined) return behavior === 'self-resolve'
  }
  return _SELF_RESOLVING_FALLBACK.has(type)
}

/**
 * 检查组件 dataKey 是否已有专用处理逻辑（排除默认绑定逻辑）
 *
 * 包含：el-table / el-pagination / 全部值型表单组件 / r-* 自解析组件
 */
function isDataKeyHandledType(type: string, registry?: ComponentRegistry): boolean {
  return type === 'el-table'
    || PAGINATION_TYPES.has(type)
    || FORM_ELEMENT_TYPES.has(type)
    || isSelfResolvingType(type, registry)
}

// ── 公共入口 ──────────────────────────────────────────────────────────────

/**
 * 递归替换 rule 中的数据占位符和事件处理器（公共 API）
 */
export function bindDataToRules(options: RuleBindingOptions): Rule[] {
  return bindRulesRecursive(options, EMPTY_CONTEXT)
}

// ── 递归编排 ──────────────────────────────────────────────────────────────

function bindRulesRecursive(options: RuleBindingOptions, parentContext: BindingContext): Rule[] {
  const { rules, pageFunctions, dataSet, registry } = options
  const callFunc = createFunctionCaller(pageFunctions)

  return rules.map(rule => {
    const newRule = { ...rule }

    // ── dataKey 规范化：旧 4 段格式自动剥离 scope 前缀 ──
    if (typeof newRule['dataKey'] === 'string') {
      newRule['dataKey'] = normalizeDataKey(newRule['dataKey'])
    }

    // ── Render* 组件：已由 usePageRenderer 注册为响应式 Vue 组件，保持原样 ──
    if (typeof newRule.type === 'string' && newRule.type.startsWith('Render')) {
      return newRule as Rule
    }

    // ── 事件处理器：字符串函数名 → callFunc 包装 ──
    if (newRule.on && typeof newRule.on === 'object') {
      const newOn: Record<string, unknown> = {}
      for (const [eventName, handler] of Object.entries(newRule.on)) {
        if (typeof handler === 'string') {
          newOn[eventName] = (...args: unknown[]) => callFunc(handler, ...args)
        } else {
          newOn[eventName] = handler
        }
      }
      newRule.on = newOn as Record<string, Function | Function[]>
    }

    // ── props 中的 on* 函数名 → callFunc 包装（自定义组件，如 r-tree） ──
    if (newRule.props && typeof newRule.props === 'object') {
      for (const [propName, propValue] of Object.entries(newRule.props)) {
        if (propName.startsWith('on') && typeof propValue === 'string') {
          newRule.props[propName] = (...args: unknown[]) => callFunc(propValue, ...args)
        }
      }
    }

    // ── r-* 自定义组件：透传 dataKey / name → props ──
    // 容器组件（self-resolving）：透传 dataKey（组件自行 consume PAGE_DATASET 解析）
    // 所有 r-* 组件：透传 name（字段名，与父组件 dataKey 叠加定位数据）
    const ruleType = newRule.type as string
    if (isSelfResolvingType(ruleType, registry)) {
      if (newRule['dataKey'] !== undefined) {
        setRuleProp(newRule, 'dataKey', newRule['dataKey'] as string)
      }
    }
    // name 透传：form-create 不会把 rule.name 自动作为 Vue prop 传入，
    // 所有 r-* 字段/容器组件都需要通过 props.name 接收字段名
    if (ruleType.startsWith('r-') && newRule.name !== undefined) {
      setRuleProp(newRule, 'name', newRule.name)
    }

    // ── el-table ──
    if (newRule.type === 'el-table' && newRule['dataKey'] !== undefined) {
      bindTableRule(newRule, dataSet, options.bindingId)
    }

    // ── el-pagination ──
    if (PAGINATION_TYPES.has(newRule.type as string) && newRule['dataKey'] !== undefined) {
      bindPaginationRule(newRule, dataSet)
    }

    // ── 值型表单组件（el-select / el-radio-group / el-input / el-switch 等全系列） ──
    if (FORM_ELEMENT_TYPES.has(newRule.type as string) && newRule['dataKey'] !== undefined) {
      bindFormElementRule(newRule, dataSet, parentContext, options.bindingId)
    }

    // ── 通用 dataKey → 文本内容 / DataView 注入（未被上述委托处理的组件） ──
    if (newRule['dataKey'] !== undefined && !isDataKeyHandledType(newRule.type as string, registry)) {
      bindGenericDataKey(newRule, dataSet)
    }

    // ── 权限渲染（跨组件统一：按钮可见性 / 列隐藏 / 表单字段 disabled） ──
    applyPermissions(newRule, parentContext)

    // ── 构建子级上下文（数据容器组件更新 dataSource，字段提供者更新 fieldName） ──
    let resolvedDataSource = null
    if (DATA_CONTAINER_TYPES.has(newRule.type as string)) {
      const rawKey = newRule['dataKey'] as string | undefined
      if (rawKey && dataSet) {
        const binding = resolveDataKeyBinding(rawKey, dataSet)
        if (binding?.kind === 'view') {
          resolvedDataSource = binding.source
        }
      }
    }
    const childContext = buildChildContext(
      newRule.type,
      newRule.props as Record<string, unknown> | undefined,
      parentContext,
      resolvedDataSource
    )

    // ── 递归处理子元素（传递更新后的上下文） ──
    if (newRule.children && Array.isArray(newRule.children)) {
      const childRules = newRule.children.filter(
        (child: unknown): child is Rule => typeof child !== 'string'
      )
      if (childRules.length > 0) {
        newRule.children = bindRulesRecursive(
          { ...options, rules: childRules },
          childContext
        )
      }
    }

    // ── r-* 容器组件：children → sparkChildren prop ──
    // form-create 的 slot 机制会用内部包装组件包裹子元素，
    // 破坏 el-table 对 el-table-column 的直接子级检测。
    // 将已递归处理的 children 移入 sparkChildren prop，
    // 由容器组件自行通过 SparkComponentRenderer 渲染。
    if (isSelfResolvingType(ruleType, registry)) {
      const sparkKids = Array.isArray(newRule.children) ? newRule.children.filter(
        (child: unknown): child is Rule => typeof child === 'object' && child !== null
      ) : []
      if (sparkKids.length > 0) {
        if (import.meta.env.DEV) pageLogger.info('sparkChildren 注入', { type: ruleType, count: sparkKids.length })
        setRuleProp(newRule, 'sparkChildren', sparkKids)
        newRule.children = []
      }
    }

    return newRule
  })
}

// ── 通用 dataKey 绑定（回退逻辑） ──────────────────────────────────────────

/**
 * 未被类型特定委托处理的组件的 dataKey 回退绑定
 *
 * 普通 HTML 元素（div / span / el-tag 等）：将解析值转为字符串设置为 children
 * 同时注入 DataView 到 props（如适用）
 */
function bindGenericDataKey(rule: Rule, dataSet: IDataSet | null): void {
  const rawKey = rule['dataKey'] as string
  if (!isDataKey(rawKey)) return

  const resolved = resolveRuleDataKey(rawKey, dataSet)

  // 注入 DataView（如 dataKey 指向 DataSet 路径）
  if (dataSet) {
    const view = getViewFromRawKey(rawKey, dataSet)
    if (view) setRuleProp(rule, 'dataView', view)
  }

  if (resolved === undefined || resolved === null) return

  // 普通元素：将值转换为字符串并设置为 children
  rule.children = [String(resolved)]
}

// ── 函数调用器 ─────────────────────────────────────────────────────────────

/**
 * 创建统一的函数调用器
 *
 * 优势：运行时检查 + 统一错误处理 + 可扩展（bind / 拦截 / 性能监控）
 */
function createFunctionCaller(
  pageFunctions: Record<string, (...args: unknown[]) => unknown>
): (functionName: string, ...args: unknown[]) => unknown {
  return function callFunc(functionName: string, ...args: unknown[]): unknown {
    try {
      const func = pageFunctions[functionName]
      if (typeof func !== 'function') {
        pageLogger.warn('函数未定义或不可调用', {
          functionName,
          type: typeof func,
          available: Object.keys(pageFunctions)
        })
        return undefined
      }
      return (func as (...args: unknown[]) => unknown)(...args)
    } catch (error: unknown) {
      pageLogger.error('函数执行错误', {
        functionName,
        args,
        error: toErrorMessage(error)
      })
      throw error
    }
  }
}