import { DataSetCrudTool, type DataSetMetadata } from '@spark-view/spark-data'
import { copyOwnEnumerableProperties } from '@spark-view/spark-utils/internal'

function parsePageDataText(rawText: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawText)
  const record = copyOwnEnumerableProperties(parsed)
  if (record === null) {
    throw new Error('pagedata.json 顶层必须是 JSON 对象')
  }
  return record
}

function metadataToRecord(meta: DataSetMetadata): Record<string, unknown> {
  return copyOwnEnumerableProperties(meta) ?? {}
}

export function canonicalizePageDataValue(rawValue: Record<string, unknown>): {
  text: string
  value: Record<string, unknown>
  tool: DataSetCrudTool
} {
  const tool = DataSetCrudTool.fromJson(rawValue)
  const value = metadataToRecord(tool.toJson())

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
  return canonicalizePageDataValue(metadataToRecord(metadata)).text
}
