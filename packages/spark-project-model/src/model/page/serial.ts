import { DataSet, getSparkNodeChildren, SparkNodeTree, type SparkNode } from '@spark-appworks/spark-data'
import { parsePageData } from '../serialization/compiler'

export function tryParseRuleTextError(rawText: string): string | null {
  try {
    parseRuleText(rawText)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function tryParsePageDataTextError(rawText: string, defaultDataSetName = ''): string | null {
  try {
    parsePageDataText(rawText, defaultDataSetName)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function parseRuleText(rawText: string): SparkNode {
  if (!rawText.trim()) {
    return SparkNodeTree.fromPageChildren([]).root
  }
  return SparkNodeTree.fromRuleJson(rawText).root
}

export function serializeRuleTree(rule: SparkNode): string {
  const children = getSparkNodeChildren(rule.children)
  const firstChild = children[0]
  const rootValue: SparkNode | SparkNode[] = children.length === 1 && firstChild !== undefined
    ? firstChild
    : children
  return `${JSON.stringify(rootValue, null, 2)}\n`
}

/** pagedata 解析 SSOT：委托 compiler.parsePageData，空内容保留 pageId 默认名。 */
export function parsePageDataText(rawText: string, defaultDataSetName = ''): DataSet {
  if (!rawText.trim()) {
    return DataSet.fromJson({ dataSetName: defaultDataSetName, tables: {} })
  }
  return parsePageData(rawText)
}

export function serializeDataSet(dataSet: DataSet): string {
  return `${JSON.stringify(dataSet.toJson(), null, 2)}\n`
}
