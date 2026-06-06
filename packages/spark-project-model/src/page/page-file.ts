/** 页面四文件：路径常量、IO 类型、文本 parse/serialize。 */
import { DataSet, getSparkNodeChildren, SparkNodeTree, type SparkNode } from '@spark-appworks/spark-data'
import { parsePageData } from './compile-files'

export function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

export const PAGE_NODE_FILE_NAMES: readonly ['rule.json', 'pagedata.json', 'script.js', 'style.css'] = [
  'rule.json',
  'pagedata.json',
  'script.js',
  'style.css',
]

export type PageNodeFileName = typeof PAGE_NODE_FILE_NAMES[number]

export type PageNodeLoadOptions = {
  forceReload?: boolean
}

export function pageFilePath(pageId: string, filename: string): string {
  return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
}

export function pageFilePaths(pageId: string): readonly string[] {
  return PAGE_NODE_FILE_NAMES.map(filename => pageFilePath(pageId, filename))
}

export type PageContentLoadResult<T = unknown> = {
  success: boolean
  data?: T
  error?: string
  reason?: string
  source?: 'remote'
  timestamp?: number
  sourceTimestamp?: string
  fromCache?: boolean
  notModified?: boolean
}

export type PageNodeFileVersionSummary = {
  version: number
  createdAt: string
  isCurrent: boolean
  modifiedBy: string | null
}

export type PageFileCreateOptions = {
  title?: string
  icon?: string
}

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

export function parsePageDataText(rawText: string, defaultDataSetName = ''): DataSet {
  if (!rawText.trim()) {
    return DataSet.fromJson({ dataSetName: defaultDataSetName, tables: {} })
  }
  return parsePageData(rawText)
}

export function serializeDataSet(dataSet: DataSet): string {
  return `${JSON.stringify(dataSet.toJson(), null, 2)}\n`
}
