import { DataSet, getSparkNodeChildren, SparkNodeTree, type SparkNode } from '@spark-appworks/spark-data'

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

export function parsePageDataText(rawText: string, defaultDataSetName = ''): DataSet {
  if (!rawText.trim()) {
    return DataSet.fromJson({ dataSetName: defaultDataSetName, tables: {} })
  }
  return DataSet.fromJson(rawText)
}

export function serializeDataSet(dataSet: DataSet): string {
  return `${JSON.stringify(dataSet.toJson(), null, 2)}\n`
}
