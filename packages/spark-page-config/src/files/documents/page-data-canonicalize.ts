import { DataSetCrudTool, type DataSetMetadata } from '@spark-view/spark-data'

function parsePageDataText(rawText: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawText)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('pagedata.json 顶层必须是 JSON 对象')
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(parsed)) {
    const desc = Object.getOwnPropertyDescriptor(parsed, key)
    if (desc) result[key] = desc.value
  }
  return result
}

function metadataToRecord(meta: DataSetMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(meta)) {
    const desc = Object.getOwnPropertyDescriptor(meta, key)
    if (desc) result[key] = desc.value
  }
  return result
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
