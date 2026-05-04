import { PAGE_MODEL_DATASET_TOOL_ROWS, type PageModelDatasetToolRow } from './dataset-tool-catalog'
import { createPageModelFunction, pageModelToolFailure, type PageModelToolFamily } from './tool-contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneSnapshot(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('pagedata.json 必须是对象。')
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function requireArgsRecord(args: unknown): Record<string, unknown> {
  if (args === undefined) return {}
  if (!isRecord(args)) throw new Error('参数必须是对象。')
  return args
}

function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`缺少 ${key}（string）。`)
  return value
}

function ensureTables(snapshot: Record<string, unknown>): Record<string, unknown> {
  const tables = snapshot['tables']
  if (isRecord(tables)) return tables
  const nextTables: Record<string, unknown> = {}
  snapshot['tables'] = nextTables
  return nextTables
}

function executeJsonDataset(row: PageModelDatasetToolRow, args: unknown, value: unknown): { data: unknown; nextSnapshot?: unknown } {
  const snapshot = cloneSnapshot(value)
  const params = requireArgsRecord(args)
  switch (row.action) {
    case 'datasetTool.export':
      return { data: snapshot }
    case 'datasetTool.listTables':
      return { data: Object.values(ensureTables(snapshot)) }
    case 'datasetTool.createTable': {
      const tableName = requireStringArg(params, 'tableName')
      const columns = params['columns']
      if (!Array.isArray(columns)) throw new Error('columns 必须是数组。')
      const tables = ensureTables(snapshot)
      if (tables[tableName] !== undefined) throw new Error(`table already exists: ${tableName}`)
      tables[tableName] = {
        tableName,
        columns,
        views: {
          default: { tableName, viewId: 'default' },
        },
      }
      return { data: tables[tableName], nextSnapshot: snapshot }
    }
    default:
      throw new Error(`当前 JSON headless datasetTool 暂未实现 ${row.action}；真实 UI host 可提供 ${row.crudToolMethod} 方法承接。`)
  }
}

function readSnapshotFromRuntime(runtime: unknown): unknown {
  if (!isRecord(runtime)) return undefined
  const toJson = runtime['toJson']
  if (typeof toJson === 'function') return toJson.call(runtime) as unknown
  return runtime
}

function executeDatasetRow(row: PageModelDatasetToolRow, args: unknown, runtime: unknown): { data: unknown; nextSnapshot?: unknown } {
  const member = isRecord(runtime) ? runtime[row.crudToolMethod] : undefined
  if (typeof member === 'function') {
    const data = Object.keys(row.paramsSchema).length === 0
      ? member.call(runtime) as unknown
      : member.call(runtime, args ?? {}) as unknown
    return { data, nextSnapshot: row.type === 'request' ? readSnapshotFromRuntime(runtime) : undefined }
  }
  if (member !== undefined && Object.keys(row.paramsSchema).length === 0) return { data: member }
  return executeJsonDataset(row, args, runtime)
}

export function createDatasetToolFamily(): PageModelToolFamily {
  return {
    name: 'datasetTool',
    title: '数据集工具',
    description: '负责 pagedata.json 的 DataSet/DataView/DataTable 查询和写入。',
    rules: ['datasetTool 是 pagedata.json 的领域工具族，函数规格来自旧 DataSetCrudTool stills catalog。'],
    functions: PAGE_MODEL_DATASET_TOOL_ROWS.map((row) => createPageModelFunction({
      action: row.action,
      type: row.type,
      description: row.description,
      paramsSchema: row.paramsSchema,
      resultSchema: row.resultSchema,
      example: row.example,
      usageRules: row.usageRules,
      failureModes: row.failureModes,
      ...(row.type === 'request' ? { persistAfterExecute: 'success' as const } : {}),
      execute: ({ host, args }) => {
        try {
          const result = executeDatasetRow(row, args, host.getDataSetTool())
          if (row.type === 'request' && result.nextSnapshot !== undefined) {
            host.setDataSetTool(result.nextSnapshot)
          }
          return { data: result.data, summary: `${row.action} 完成` }
        } catch (error) {
          return pageModelToolFailure({
            code: 'DATASET_TOOL_EXECUTE_ERROR',
            msg: error instanceof Error ? error.message : String(error),
            fix: `按 ${row.action} 的参数规格重试：${JSON.stringify(row.paramsSchema)}`,
          })
        }
      },
    })),
  }
}
