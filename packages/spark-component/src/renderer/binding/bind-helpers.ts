/**
 * 规则绑定共享工具函数
 *
 * 功能分区：
 * 1) 日志与基础写入（pageLogger / setRuleProp）
 * 2) 运行时 getter 注入（definePropertyGetter）
 * 3) dataKey 解析薄封装（resolveRuleDataKey）
 *
 * 被各组件委托（bind-table-delegate / bind-pagination-delegate / bind-form-delegate）
 * 与主编排（bindRules.ts）共同复用。
 */

import { Logger } from '@spark-view/spark-utils'
import type { BindRule } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { resolveRawKey, isDataKey } from '@spark-view/spark-data'

export const pageLogger = Logger('PageRenderer')

// ── 分区 A：基础写入 ───────────────────────────────────────────────────────

/**
 * 安全设置 rule.props（初始化后赋值，避免重复 ??=）
 */
export function setRuleProp(rule: BindRule, key: string, value: unknown): void {
  rule.props ??= {}
  rule.props[key] = value
}

// ── 分区 B：响应式读取桥接 ─────────────────────────────────────────────────

/**
 * 定义响应式 getter 属性（消除 Object.defineProperty 样板代码）
 *
 * 被 bind-form-delegate / bind-pagination-delegate 等委托共用，
 * 让渲染器每次渲染时通过 getter 读取 DataView 最新值。
 */
export function definePropertyGetter(
  obj: Record<string, unknown>,
  key: string,
  getter: () => unknown
): void {
  Object.defineProperty(obj, key, {
    get: getter,
    enumerable: true,
    configurable: true,
  })
}

// ── 分区 C：dataKey 解析薄封装 ─────────────────────────────────────────────

/**
 * 解析 DataKey 字符串 → 绑定值（渲染层薄包装，负责 warn 日志）
 *
 * 数据解析逻辑完全委托给 spark-data 的 `resolveRawKey`。
 */
export function resolveRuleDataKey(
  rawKey: string,
  dataSet: IDataSet | null
): ReturnType<typeof resolveRawKey> {
  if (!isDataKey(rawKey)) {
    pageLogger.warn(
      `dataKey "${rawKey}" 不是有效的 DataKey 格式（缺少 @），已跳过绑定。` +
      '请使用 tableName@viewId@field 或 tableName@field 格式。'
    )
    return undefined
  }
  if (!dataSet) return undefined
  return resolveRawKey(rawKey, dataSet)
}
