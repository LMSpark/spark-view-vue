/**
 * pagedata.json 规范化：与 spark-data DataSet 序列化对齐，不含设计器 UI 语义。
 */

import { DataSetCrudTool, type DataSetMetadata } from '@spark-appworks/spark-data'
import { copyOwnEnumerableProperties } from '@spark-appworks/spark-utils/internal'

function parsePageDataText(rawText: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawText)
  const record = copyOwnEnumerableProperties(parsed)
  if (record === null) {
    throw new Error('pagedata.json 顶层必须是 JSON 对象')
  }
  return record
}

export function canonicalizePageDataValue(rawValue: Record<string, unknown>): {
  text: string
  value: Record<string, unknown>
  tool: DataSetCrudTool
} {
  const tool = DataSetCrudTool.fromJson(rawValue)
  const value = copyOwnEnumerableProperties(tool.toJson()) ?? {}

  return {
    text: `${JSON.stringify(value, null, 2)}\n`,
    value,
    tool,
  }
}

export function canonicalizePageDataJson(rawText: string): {
  text: string
  value: Record<string, unknown>
  tool: DataSetCrudTool
} {
  return canonicalizePageDataValue(parsePageDataText(rawText))
}

export function canonicalizeDataSetMetadata(metadata: DataSetMetadata): string {
  return canonicalizePageDataValue(copyOwnEnumerableProperties(metadata) ?? {}).text
}
