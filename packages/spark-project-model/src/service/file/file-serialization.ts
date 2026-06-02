/**
 * 页面四文件 parse / serialize 独立函数。
 *
 * 供 PageNode 子模型在 load/save 时复用，不依赖设计时 UI 状态。
 * 供 PageNode 在 load/save 时调用。
 */

import { DataSet } from '@spark-view/spark-data'
import { getSparkNodeChildren, SparkNodeTree, type SparkNode } from '@spark-view/spark-data'
import { canonicalizeDataSetMetadata } from '../../artifact/data.artifact'

// ── rule.json ────────────────────────────────────────────

/** rule.json 文本 → 页面根 SparkNode。空文本返回空页面根。 */
export function parseRuleText(rawText: string): SparkNode {
  if (!rawText.trim()) {
    return SparkNodeTree.fromPageChildren([]).root
  }
  return SparkNodeTree.fromRuleJson(rawText).root
}

/** 页面根 SparkNode → rule.json 文本。 */
export function serializeRuleTree(rule: SparkNode): string {
  const children = getSparkNodeChildren(rule.children)
  const firstChild = children[0]
  const rootValue: SparkNode | SparkNode[] = children.length === 1 && firstChild !== undefined
    ? firstChild
    : children
  return `${JSON.stringify(rootValue, null, 2)}\n`
}

// ── pagedata.json ────────────────────────────────────────

/** pagedata.json 文本 → DataSet。空文本以 defaultDataSetName 构造空数据集。 */
export function parsePageDataText(rawText: string, defaultDataSetName = ''): DataSet {
  if (!rawText.trim()) {
    return DataSet.fromJson({ dataSetName: defaultDataSetName, tables: {} })
  }
  return DataSet.fromJson(rawText)
}

/** DataSet → pagedata.json 文本。 */
export function serializeDataSet(dataSet: DataSet): string {
  return canonicalizeDataSetMetadata(dataSet.toJson())
}
