/**
 * 规则绑定共享工具函数
 *
 * 被各组件委托（bind-table-delegate / bind-pagination-delegate / bind-form-delegate）
 * 和主编排（bindRules.ts）共同引用。
 */

import { Logger } from '@spark-view/spark-utils'
import type { BindRule } from '../types'
import type { IDataSet } from '@spark-view/spark-data'
import { resolveRawKey, isDataKey } from '@spark-view/spark-data'

export const pageLogger = Logger('PageRenderer')

/**
 * 安全设置 rule.props（初始化后赋值，避免重复 ??=）
 */
export function setRuleProp(rule: BindRule, key: string, value: unknown): void {
  rule.props ??= {}
  rule.props[key] = value
}

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
