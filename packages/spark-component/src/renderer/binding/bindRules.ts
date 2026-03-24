/**
 * 规则绑定主编排器
 *
 * 功能分区：
 * 1) 入口预处理（SparkNode 归一化、函数调用器准备）
 * 2) 递归编排（事件包装、dataKey 委托、权限注入、上下文传递）
 * 3) 通用回退（未命中特定委托时的 dataKey 解析）
 * 4) 统一执行面（脚本函数调用与错误日志）
 *
 * 核心职责：递归遍历 rule 树，根据组件类型委托给对应绑定模块：
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
 * 数据流：rule.json → bindDataToRules() → BindRule[]（框架无关运行时规则）
 */

import type { BindRule, RuleBindingOptions } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { isDataKey, resolveDataKeyBinding, getViewFromRawKey } from '@spark-view/spark-data'
import { toErrorMessage } from '@spark-view/spark-utils'
import type { ComponentRegistry } from '../../types.js'

// ── 分区 A：委托依赖 ───────────────────────────────────────────────────────

import { resolveRuleDataKey, setRuleProp, pageLogger } from './bind-helpers'
import { normalizeRuleEvents, normalizeOnProps, unpackContainerStructures, migrateNameToField, migrateRootLevelStyleClass } from './bind-normalize'
import { bindTableRule } from './bind-table-delegate'
import { bindPaginationRule } from './bind-pagination-delegate'
import { bindFormElementRule } from './bind-form-delegate'
import { applyPermissions } from './bind-permission-delegate'
import { type BindingContext, EMPTY_CONTEXT, buildChildContext } from './bind-context'
import { getBindingDelegate, isSelfResolvingType, isDataContainerType } from './component-binding-registry'

// ── 分区 B：递归辅助常量 ───────────────────────────────────────────────────

const _COMPONENT_ARRAY_PROP_KEYS = new Set(['headerActions', 'footerActions', 'toolbar', 'rowActions', 'nodeActions', 'itemActions'])

// ── 分区 D：私有辅助函数 ────────────────────────────────────────

/**
 * 解析 Render* 函数组件：查找匹配的沙箱函数，失败时降级为占位节点
 *
 * @returns 处理后的规则节点（已处理时），或 null（非 Render* 类型时）
 */
function resolveRenderType(
  rule: BindRule,
  pageFunctions: Record<string, (...args: unknown[]) => unknown>,
): BindRule | null {
  if (typeof rule.type !== 'string' || !rule.type.startsWith('Render')) return null

  const renderType = rule.type
  const camelType = renderType.charAt(0).toLowerCase() + renderType.slice(1)
  const renderFn = pageFunctions[renderType] ?? pageFunctions[camelType]
  if (typeof renderFn === 'function') return rule

  pageLogger.error('Render 函数未定义，已降级为占位节点', {
    renderType,
    availableRenderFns: Object.keys(pageFunctions).filter(name => name.startsWith('Render')),
  })
  return {
    ...rule,
    type: 'div',
    children: [`⚠️ 未定义渲染函数: ${renderType}`],
  } as BindRule
}

/**
 * 根据组件类型将 dataKey 绑定委托给对应的处理器（注册表驱动）
 *
 * 分发策略：
 * 1. 查询绑定注册表获取 bindingDelegate → 调用对应委托
 * 2. 无委托且非自解析 → bindGenericDataKey（通用回退）
 * 3. 自解析组件 → 跳过（组件自行 consume PAGE_DATASET）
 *
 * 扩展：调用 registerBindingDescriptor('vxe-table', { bindingDelegate: 'table' })
 * 即可让新组件类型复用 el-table 的绑定逻辑，无需修改本函数。
 */
function dispatchDataKeyBinding(
  rule: BindRule,
  ruleType: string,
  dataSet: IDataSet | null,
  registry: ComponentRegistry | undefined,
): void {
  const delegate = getBindingDelegate(ruleType)
  if (delegate === 'table') {
    bindTableRule(rule, dataSet)
  } else if (delegate === 'pagination') {
    bindPaginationRule(rule, dataSet)
  } else if (delegate === 'form-element') {
    bindFormElementRule(rule, dataSet)
  } else if (!isSelfResolvingType(ruleType, registry)) {
    bindGenericDataKey(rule, dataSet)
  }
}

// ── 分区 D-2：函数调用器工厂 ────────────────────────────────────────────────

/**
 * 创建统一的函数调用器
 *
 * 运行时检查 + 统一错误处理，仅供 bindDataToRules 使用。
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

// ── 分区 E：公共入口（预处理 + 编排启动） ─────────────────────

/**
 * 递归替换 rule 中的数据占位符和事件处理器
 *
 * @deprecated v3.1 — 仅用于测试管线。生产代码使用 SparkPageRenderer.vue 中的 bindSparkRuleEvents()。
 * 计划在 v4.0 中移除或替换为统一绑定 API。
 * @see SparkPageRenderer.vue#bindSparkRuleEvents
 */
export function bindDataToRules(options: RuleBindingOptions): BindRule[] {
  const { dataSet, registry, pageFunctions } = options
  const callFunc = createFunctionCaller(pageFunctions)

  // 闭包捕获不变字段，递归中仅传变化的 rules + parentContext，
  // 消除每层递归的 `{ ...options, rules }` 对象分配。
  return recurse(options.rules, EMPTY_CONTEXT)

  function recurse(
    rules: BindRule[],
    parentContext: BindingContext,
  ): BindRule[] {

  return rules.map(rule => {
    const newRule = { ...rule }

    // ── Render* 组件：已由 registerRenderFunctions 注册为响应式 Vue 组件，保持原样 ──
    const renderResult = resolveRenderType(newRule, pageFunctions)
    if (renderResult !== null) return renderResult

    // ── 事件处理器：字符串函数名 → callFunc 包装 ──
    if (newRule.on && typeof newRule.on === 'object') {
      newRule.on = normalizeRuleEvents(newRule.on, callFunc)
    }

    // ── props 中的 on* 函数名 → callFunc 包装（自定义组件，如 r-tree） ──
    if (newRule.props && typeof newRule.props === 'object') {
      normalizeOnProps(newRule.props, callFunc)
    }

    // ── r-* 自定义组件：透传 dataKey / field → props ──
    // 容器组件（self-resolving）：透传 dataKey（组件自行 consume PAGE_DATASET 解析）
    // 所有 r-* 组件：透传 field（字段名，与父组件 dataKey 叠加定位数据）
    const ruleType = newRule.type
    if (isSelfResolvingType(ruleType, registry)) {
      if (newRule['dataKey'] !== undefined) {
        setRuleProp(newRule, 'dataKey', newRule['dataKey'] as string)
      }
    }
    // 向后兼容：v2 配置使用 name 作为字段绑定名，v3 统一为 field
    if (ruleType.startsWith('r-')) {
      migrateNameToField(newRule)
    }

    // ── 容器结构化字段：root → props 扁平化（配置驱动，OCP） ──
    if (ruleType.startsWith('r-')) {
      unpackContainerStructures(newRule)
    }

    // ── el-table / el-pagination / 表单组件 / 通用组件：dataKey 互斥委托 ──
    if (newRule['dataKey'] !== undefined) {
      dispatchDataKeyBinding(newRule, ruleType, dataSet, registry)
    }

    // ── 权限渲染（跨组件统一：按钮可见性 / 列隐藏 / 表单字段 disabled） ──
    applyPermissions(newRule, parentContext)

    // ── 构建子级上下文（数据容器组件更新 dataSource，字段提供者更新 fieldName） ──
    let resolvedDataSource = null
    if (isDataContainerType(ruleType)) {
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
      newRule.props,
      parentContext,
      resolvedDataSource
    )

    if (newRule.props && typeof newRule.props === 'object') {
      for (const key of _COMPONENT_ARRAY_PROP_KEYS) {
        const rawValue = newRule.props[key]
        if (!Array.isArray(rawValue)) continue
        const nestedRules = rawValue.filter(
          (item: unknown): item is BindRule => typeof item === 'object' && item !== null && 'type' in item
        )
        if (nestedRules.length === 0) continue
        newRule.props[key] = recurse(
          nestedRules,
          childContext,
        )
      }
    }

    // ── 递归处理子元素（传递更新后的上下文） ──
    if (newRule.children && Array.isArray(newRule.children)) {
      const childRules = newRule.children.filter(
        (child: unknown): child is BindRule => typeof child !== 'string'
      )
      if (childRules.length > 0) {
        newRule.children = recurse(
          childRules,
          childContext,
        )
      }
    }

    // ── 向下兼容：旧 rule.json 顶层 style / class → props ──────────────────
    migrateRootLevelStyleClass(newRule)

    return newRule
  })
  } // end recurse
} // end bindDataToRules

// ── 分区 F：通用 dataKey 绑定（回退逻辑） ──────────────────────────────────

/**
 * 未被类型特定委托处理的组件的 dataKey 回退绑定
 *
 * 普通 HTML 元素（div / span / el-tag 等）：将解析值转为字符串设置为 children
 * 同时注入 DataView 到 props（如适用）
 */
function bindGenericDataKey(rule: BindRule, dataSet: IDataSet | null): void {
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

