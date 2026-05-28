/**
 * 页面四文件 parse / serialize 独立函数。
 *
 * 供 PageModel 子模型在 load/save 时复用，不依赖设计时 UI 状态。
 * 供 PageModel 在 load/save 时调用。
 */

import { DataSetCrudTool } from '@spark-view/spark-data'
import { getSparkNodeChildren, SparkNodeTree, type SparkNode } from '@spark-view/spark-data'
import { canonicalizeDataSetMetadata } from '../design/page-data-canonicalize'

// ── rule.json ────────────────────────────────────────────

/** rule.json 文本 → SparkNodeTree。空文本返回空树。 */
export function parseRuleText(rawText: string): SparkNodeTree {
  if (!rawText.trim()) {
    return SparkNodeTree.fromPageChildren([])
  }
  const normalizedRoot = SparkNodeTree.fromRuleJson(rawText).toJSON()
  return SparkNodeTree.fromJson(normalizedRoot)
}

/** SparkNodeTree → rule.json 文本。 */
export function serializeRuleTree(tree: SparkNodeTree): string {
  const root = tree.toJSON()
  const children = getSparkNodeChildren(root.children)
  const firstChild = children[0]
  const rootValue: SparkNode | SparkNode[] = children.length === 1 && firstChild !== undefined
    ? firstChild
    : children
  return `${JSON.stringify(rootValue, null, 2)}\n`
}

// ── pagedata.json ────────────────────────────────────────

/** pagedata.json 文本 → DataSetCrudTool。空文本以 defaultDataSetName 构造空工具。 */
export function parsePageDataText(rawText: string, defaultDataSetName = ''): DataSetCrudTool {
  if (!rawText.trim()) {
    return new DataSetCrudTool(defaultDataSetName)
  }
  return DataSetCrudTool.fromJson(rawText)
}

/** DataSetCrudTool → pagedata.json 文本。 */
export function serializeDataSet(tool: DataSetCrudTool): string {
  return canonicalizeDataSetMetadata(tool.toJson())
}
