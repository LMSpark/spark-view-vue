/**
 * RuleConfig → page children 归并器
 *
 * 边界约束：
 * - spark-page-config 负责提供声明式 RuleConfig 树
 * - spark-component 负责将其物化为运行时 children（SparkNode[]）
 *
 * 归并内容：
 * - 根级业务字段收入 props
 * - on / ActionDescriptor 绑定为可执行闭包
 * - children 递归转换
 * - props 内嵌 SparkNode 递归归并
 * - 顶层 id 去重
 */

import type { RuleConfig } from '@spark-view/spark-page-config'
import { SPARK_NODE_STRUCT_KEYS, isSparkNode, type SparkNode, type SparkNodeChildren } from '../../core/types'
import type { ActionExecutionContext } from '../actions'
import { normalizeRuleEvents, normalizeOnProps } from './bind-normalize.js'

// ── 导出类型 ───────────────────────────────────────────────────────────────

/** 页面脚本函数调用签名。 */
export type PageScriptCaller = (functionName: string, ...args: unknown[]) => unknown

/** buildPageChildren 运行时依赖。 */
export interface BuildPageChildrenOptions {
  /** 脚本函数调用器，用于把字符串事件名绑定到真实脚本函数。 */
  callFunc: PageScriptCaller
  /** 动作执行上下文，用于把声明式 action descriptor 绑定成可执行闭包。 */
  actionCtx: ActionExecutionContext
}

// ── 公开入口 ───────────────────────────────────────────────────────────────

/**
 * 将 RuleConfig 树物化为运行时 SparkNode[]。
 *
 * 这里做的是“绑定层归并”，不是渲染：
 * - 统一把根级业务字段收入 props
 * - 统一绑定 on / on* 事件
 * - 递归处理 children 与 props 中嵌套的 SparkNode
 * - 保证顶层 id 在同一次构建内唯一
 */
export function buildPageChildren(
  rules: RuleConfig[],
  options: BuildPageChildrenOptions,
): SparkNode[] {
  const { callFunc, actionCtx } = options

  // 同一轮 build 内的 id 去重表。作用域只限当前规则树，避免跨页面污染。
  const usedIds = new Set<string>()

  // ── 基础判定 ───────────────────────────────────────────────────────────

  /**
   * 仅允许字符串、数字或合法 SparkNode 进入 children。
   *
   * 这样可以把 bindValue 后的中间结果安全收敛到 SparkNodeChildren，
   * 同时过滤掉对象空壳、布尔值等不应进入渲染树的值。
   */
  function isSparkChild(value: unknown): value is SparkNodeChildren[number] {
    return typeof value === 'string' || typeof value === 'number' || isSparkNode(value)
  }

  // ── 局部归并辅助 ───────────────────────────────────────────────────────

  /**
  * 为节点顶层 id 生成本轮构建内唯一的稳定值。
   *
   * 规则：
   * - 有显式 id 时优先使用显式 id
   * - 无显式 id 时退回到组件 type
   * - 冲突时追加 `_2` / `_3`... 后缀
   */
  function ensureUniqueId(type: string, existingId: string | undefined): string {
    const base = existingId ?? type
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let n = 2
    while (usedIds.has(`${base}_${n}`)) n++
    const unique = `${base}_${n}`
    usedIds.add(unique)
    return unique
  }

  /**
   * 递归绑定任意值：
   * - 数组：逐项递归
   * - 普通对象：逐键递归
   * - SparkNode 形态对象：切换到 bindNode 走完整节点归并
   * - 原始值：直接透传
   */
  function bindValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(bindValue)
    if (value === null || typeof value !== 'object') return value

    const candidate = value as Record<string, unknown>
    if (typeof candidate['type'] === 'string') return bindNode(candidate)

    const normalizedObject: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(candidate)) {
      normalizedObject[key] = bindValue(nested)
    }
    return normalizedObject
  }

  // ── 节点绑定主流程 ─────────────────────────────────────────────────────

  /**
   * 将单个 RuleConfig/SparkNode 形态对象绑定为运行时 SparkNode。
   *
   * 绑定顺序故意固定：
   * 1. 复制并规范化 props
   * 2. 先处理 props 内的 on* 事件
   * 3. 递归绑定 props 中的普通业务值
   * 4. 再把根级字段并入 props（含根级 on）
   * 5. 绑定 children
  * 6. 最后统一处理顶层 id 去重
   */
  function bindNode(current: Record<string, unknown>): SparkNode {
    const cloned: SparkNode = { type: current['type'] as string }

    // 仅复制合法 props 对象；数组/null/原始值都视为无 props。
    const propsObj = current['props'] !== null && typeof current['props'] === 'object' && !Array.isArray(current['props'])
      ? { ...(current['props'] as Record<string, unknown>) }
      : {}

    if (Object.prototype.hasOwnProperty.call(propsObj, 'id')) {
      throw new Error('[spark] SparkNode.props.id has been removed. Use top-level SparkNode.id instead.')
    }

    // props 内的 onXxx 先归一化，避免后续递归时把字符串事件名当普通值透传。
    normalizeOnProps(propsObj, callFunc, actionCtx)

    // 递归绑定 props 里的业务值；事件类 key 已在上一步处理，这里跳过。
    for (const [propName, propValue] of Object.entries(propsObj)) {
      if (propName.startsWith('on')) continue
      propsObj[propName] = bindValue(propValue)
    }

    // 把根级声明字段收入 props，形成统一的运行时节点形态。
    for (const [key, value] of Object.entries(current)) {
      if (SPARK_NODE_STRUCT_KEYS.has(key)) continue

      if (key === 'on') {
        // 根级 on 统一折叠到 props.on；若 props.on 已存在，则以 props.on 为最终覆盖层。
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          const normalizedRootOn = normalizeRuleEvents(value as Record<string, unknown>, callFunc, actionCtx)
          const existingOn = propsObj['on']
          propsObj['on'] = existingOn !== null && typeof existingOn === 'object' && !Array.isArray(existingOn)
            ? { ...normalizedRootOn, ...(existingOn as Record<string, unknown>) }
            : normalizedRootOn
        }
        continue
      }

      // props 已显式声明的字段优先级更高；根级同名字段不覆盖。
      if (key in propsObj) continue

      propsObj[key] = bindValue(value)
    }

    // children 保持结构位置，不在绑定层做额外结构提升；这里只做递归绑定与类型收敛。
    if (Array.isArray(current['children'])) {
      const children = (current['children'] as unknown[]).map(bindValue).filter(isSparkChild)
      if (children.length > 0) cloned.children = children
    }

    // 仅在存在有效键时回填 props，避免产生空对象噪音。
    if (Object.keys(propsObj).length > 0) {
      cloned.props = propsObj
    }

    // id 去重放在最后；仅接受顶层 id。
    const rawId = typeof current['id'] === 'string' ? current['id'] : undefined
    if (rawId !== undefined) {
      const nodeType = cloned.type
      const finalId = ensureUniqueId(nodeType, rawId)
      cloned.id = finalId
    }

    return cloned
  }

  // 根级规则逐项绑定，保持输入顺序稳定。
  return rules.map(rule => bindNode(rule as unknown as Record<string, unknown>))
}
