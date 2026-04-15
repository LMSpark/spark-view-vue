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
 * - props.id 去重
 */

import type { RuleConfig } from '@spark-view/spark-page-config'
import { SPARK_NODE_STRUCT_KEYS, isSparkNode, type SparkNode, type SparkNodeChildren } from '../../core/types'
import type { ActionExecutionContext } from '../actions'
import { normalizeRuleEvents, normalizeOnProps } from './bind-normalize.js'

export type PageScriptCaller = (functionName: string, ...args: unknown[]) => unknown

/** 查询子组件自声明的区域角色（来自 registry meta.liftAs），返回 prop 名或 undefined */
export type LiftAsLookup = (childType: string) => string | undefined

export interface BuildPageChildrenOptions {
  callFunc: PageScriptCaller
  actionCtx: ActionExecutionContext
  /** 子类型→prop 名查询（不提供时跳过提升） */
  getLiftAs?: LiftAsLookup
}

export function buildPageChildren(
  rules: RuleConfig[],
  options: BuildPageChildrenOptions,
): SparkNode[] {
  const { callFunc, actionCtx, getLiftAs } = options
  const usedIds = new Set<string>()

  function isSparkChild(value: unknown): value is SparkNodeChildren[number] {
    return typeof value === 'string' || typeof value === 'number' || isSparkNode(value)
  }

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

  function bindNode(current: Record<string, unknown>): SparkNode {
    const cloned: SparkNode = { type: current['type'] as string }

    const propsObj = current['props'] !== null && typeof current['props'] === 'object' && !Array.isArray(current['props'])
      ? { ...(current['props'] as Record<string, unknown>) }
      : {}

    normalizeOnProps(propsObj, callFunc, actionCtx)

    for (const [propName, propValue] of Object.entries(propsObj)) {
      if (propName.startsWith('on')) continue
      propsObj[propName] = bindValue(propValue)
    }

    for (const [key, value] of Object.entries(current)) {
      if (SPARK_NODE_STRUCT_KEYS.has(key)) continue

      if (key === 'on') {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          const normalizedRootOn = normalizeRuleEvents(value as Record<string, unknown>, callFunc, actionCtx)
          const existingOn = propsObj['on']
          propsObj['on'] = existingOn !== null && typeof existingOn === 'object' && !Array.isArray(existingOn)
            ? { ...normalizedRootOn, ...(existingOn as Record<string, unknown>) }
            : normalizedRootOn
        }
        continue
      }

      if (key in propsObj) continue

      propsObj[key] = bindValue(value)
    }

    if (Array.isArray(current['children'])) {
      const children = (current['children'] as unknown[]).map(bindValue).filter(isSparkChild)
      if (children.length > 0) cloned.children = children
    }

    if (Object.keys(propsObj).length > 0) {
      cloned.props = propsObj
    }

    const rawId = typeof propsObj['id'] === 'string' ? propsObj['id'] : undefined
    if (rawId !== undefined) {
      const nodeType = cloned.type
      const finalId = ensureUniqueId(nodeType, rawId)
      propsObj['id'] = finalId
      cloned.props = propsObj
    }

    return liftChildProps(cloned, getLiftAs)
  }

  return rules.map(rule => bindNode(rule as unknown as Record<string, unknown>))
}

/**
 * 将容器节点 children 中拥有 `liftAs` 声明的子节点提升为 props。
 *
 * 例如 `r-toolbar` 声明 `liftAs: 'toolbar'`，当它出现在任意容器的 children 时
 * 自动提升为 `props.toolbar`，容器无需列举可接受的子类型。
 *
 * `{ type: 'r-table', children: [{ type: 'r-toolbar', ... }, ...rows] }`
 * → `{ type: 'r-table', props: { toolbar: { type: 'r-toolbar', ... } }, children: [...rows] }`
 */
export function liftChildProps(node: SparkNode, getLiftAs?: LiftAsLookup): SparkNode {
  if (!getLiftAs || !node.children || node.children.length === 0) return node

  const contentChildren: SparkNodeChildren = []
  const liftedProps: Record<string, SparkNode> = {}

  for (const child of node.children) {
    if (isSparkNode(child)) {
      const propName = getLiftAs(child.type)
      if (propName !== undefined && !(propName in liftedProps)) {
        liftedProps[propName] = child
        continue
      }
    }
    contentChildren.push(child)
  }

  if (Object.keys(liftedProps).length === 0) return node

  return {
    type: node.type,
    props: { ...node.props, ...liftedProps },
    ...(contentChildren.length > 0 ? { children: contentChildren } : {}),
  }
}