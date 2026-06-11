/**
 * @module @spark-appworks/spark-project-model:page/canonicalize-page-data
 * 职责：提供项目模型和页面配置域中的 canonicalize page data 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * pagedata.json 规范化：与 spark-data DataSet 序列化对齐，不含设计器 UI 语义。
 */

import { DataSetCrudTool, type DataSetMetadata } from '@spark-appworks/spark-data'
import { copyOwnEnumerableProperties } from '@spark-appworks/spark-utils/internal'

function parsePageDataJsonRecord(rawText: string): Record<string, unknown> {
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
  return canonicalizePageDataValue(parsePageDataJsonRecord(rawText))
}

export function canonicalizeDataSetMetadata(metadata: DataSetMetadata): string {
  return canonicalizePageDataValue(copyOwnEnumerableProperties(metadata) ?? {}).text
}
