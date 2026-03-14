/**
 * 通用表数据 API — 与后端 GenericTableController 对应。
 *
 * 端点：/api/data/{tableName}
 *
 * @example
 * // pagedata.json 中接入方式（DataTable api 配置）：
 * // "api": {
 * //   "list":   { "url": "/api/data/Users",     "method": "GET"    },
 * //   "create": { "url": "/api/data/Users",     "method": "POST"   },
 * //   "update": { "url": "/api/data/Users/:id", "method": "PUT"    },
 * //   "delete": { "url": "/api/data/Users/:id", "method": "DELETE" }
 * // }
 *
 * // 直接通过本模块操作（script.js 或管理界面）：
 * // import { tableApi } from '@/services/api-table'
 * // const { rows, total } = await tableApi('Users').list()
 * // const row = await tableApi('Users').create({ name: 'Alice', role: 'admin' })
 * // await tableApi('Users').update('1', { name: 'Bob' })
 * // await tableApi('Users').remove('1')
 */

import { DATA_API } from './api-paths'
import { http } from './http'
import type { RequestConfig } from '@spark-view/spark-utils'

const BASE = DATA_API

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface TableRow extends Record<string, unknown> {
  id: string
  _createdAt?: string
  _updatedAt?: string
}

export interface ListResult {
  rows: TableRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListOptions {
  page?: number
  pageSize?: number
  /** 关键词搜索（全文匹配行 JSON） */
  q?: string
  sort?: 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
}

export interface TableSummary {
  tableName: string
  rowCount: number
}

// ── 错误类 ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── 内部请求工具 ──────────────────────────────────────────────────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method?.toUpperCase() ?? 'GET') as RequestConfig['method']
  try {
    // 解析 body（fetch 用 string，axios 用 object）
    let data: unknown
    if (init?.body !== undefined && init.body !== null && typeof init.body === 'string') {
      try { data = JSON.parse(init.body) } catch { data = init.body }
    }
    const resp = await http.requestFull<T>({ url, method: method ?? 'GET', data })
    if (resp.status === 204 || resp.data === undefined || resp.data === null) {
      return undefined as T
    }
    return resp.data
  } catch (e) {
    if (e instanceof Error && 'status' in e) {
      const reqErr = e as Error & { status?: number; response?: unknown }
      const msg = (reqErr.response as Record<string, string> | null)?.['error'] ?? `HTTP ${reqErr.status ?? 'unknown'}`
      throw new ApiError(msg, reqErr.status ?? 0, reqErr.response)
    }
    throw e
  }
}

// ── 表列表 ────────────────────────────────────────────────────────────────────

/**
 * 列出所有逻辑表及行数。
 */
export async function listTables(): Promise<TableSummary[]> {
  const result = await request<{ tables: TableSummary[] }>(`${BASE}`)
  return result.tables
}

// ── 单表 CRUD 工厂 ────────────────────────────────────────────────────────────

/**
 * 返回针对指定逻辑表的 CRUD 操作集合。
 *
 * @example
 * const api = tableApi('Orders')
 * const { rows, total } = await api.list({ page: 1, pageSize: 20 })
 * const row = await api.create({ customerId: '001', amount: 99 })
 * await api.update(row.id, { amount: 120 })
 * await api.remove(row.id)
 */
export function tableApi(tableName: string) {
  const base = `${BASE}/${encodeURIComponent(tableName)}`

  return {
    /** 分页查询行 */
    async list(opts: ListOptions = {}): Promise<ListResult> {
      const params = new URLSearchParams()
      if (opts.page     !== undefined) params.set('page',     String(opts.page))
      if (opts.pageSize !== undefined) params.set('pageSize', String(opts.pageSize))
      if (opts.q)    params.set('q',     opts.q)
      if (opts.sort) params.set('sort',  opts.sort)
      if (opts.order) params.set('order', opts.order)
      const qs = params.toString()
      return request<ListResult>(`${base}${qs ? `?${qs}` : ''}`)
    },

    /** 读取单行 */
    async get(id: string): Promise<TableRow> {
      return request<TableRow>(`${base}/${encodeURIComponent(id)}`)
    },

    /** 创建行（含 id 则使用，否则后端自动生成 UUID） */
    async create(data: Record<string, unknown>): Promise<TableRow> {
      return request<TableRow>(base, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    /** 全量替换行（PUT 语义） */
    async replace(id: string, data: Record<string, unknown>): Promise<TableRow> {
      return request<TableRow>(`${base}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    /** 局部更新行（PATCH 语义，与原字段合并） */
    async update(id: string, patch: Record<string, unknown>): Promise<TableRow> {
      return request<TableRow>(`${base}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },

    /** 删除单行 */
    async remove(id: string): Promise<{ success: boolean; id: string }> {
      return request(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    /** 清空整张表（所有行） */
    async truncate(): Promise<{ success: boolean; deleted: number }> {
      return request(base, { method: 'DELETE' })
    },

    /**
     * 批量 upsert（有则更新，无则插入）。
     * @param rows 行数组，每行需含 id 字段
     */
    async batchUpsert(rows: Array<Record<string, unknown>>): Promise<{ success: boolean; upserted: number }> {
      return request(`${base}/__batch`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      })
    },
  }
}

/** 简写：拉取指定表的全部行（pageSize=500） */
export async function fetchAllRows(tableName: string): Promise<TableRow[]> {
  const result = await tableApi(tableName).list({ page: 1, pageSize: 500 })
  return result.rows
}

// ── 物理表 DDL API ────────────────────────────────────────────────────────────

const DDL_BASE = '/api/tables'

/**
 * 列定义 — 用于建表或新增列时描述字段。
 *
 * type 可选值：string | integer | number | boolean | date | datetime | text
 */
export interface ColumnDef {
  name: string
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'datetime' | 'text'
  required?: boolean
}

/** 物理列描述（来自 H2 INFORMATION_SCHEMA） */
export interface PhysicalColumn {
  columnName: string
  dataType: string
  isNullable: string
  columnDefault: string
}

export interface PhysicalTableSummary {
  tableName: string
}

/** 列出 H2 中所有物理表 */
export async function listPhysicalTables(): Promise<PhysicalTableSummary[]> {
  const result = await request<{ tables: PhysicalTableSummary[]; total: number }>(`${DDL_BASE}`)
  return result.tables
}

/**
 * 物理表 DDL 操作集合（针对指定表名）。
 *
 * @example
 * // 建表
 * await physicalTableApi('Products').create([
 *   { name: 'name',  type: 'string',  required: true },
 *   { name: 'price', type: 'number' },
 * ])
 *
 * // 描述表结构
 * const { columns } = await physicalTableApi('Products').describe()
 *
 * // 新增列
 * await physicalTableApi('Products').addColumn({ name: 'stock', type: 'integer' })
 *
 * // 修改列类型
 * await physicalTableApi('Products').alterColumn('price', 'text')
 *
 * // 删除列
 * await physicalTableApi('Products').dropColumn('stock')
 *
 * // 删除整张表
 * await physicalTableApi('Products').drop()
 */
export function physicalTableApi(tableName: string) {
  const base = `${DDL_BASE}/${encodeURIComponent(tableName)}`

  return {
    /** 创建物理表，始终包含 id 主键列 */
    async create(columns?: ColumnDef[]): Promise<{ success: boolean; tableName: string; columns: PhysicalColumn[] }> {
      return request(`${DDL_BASE}`, {
        method: 'POST',
        body: JSON.stringify({ tableName, columns: columns ?? [] }),
      })
    },

    /** 读取表结构（列描述） */
    async describe(): Promise<{ tableName: string; columns: PhysicalColumn[] }> {
      return request(`${base}`)
    },

    /** 删除整张物理表 */
    async drop(): Promise<{ success: boolean; tableName: string }> {
      return request(base, { method: 'DELETE' })
    },

    /** 新增列 */
    async addColumn(column: ColumnDef): Promise<{ success: boolean; tableName: string; columnName: string }> {
      return request(`${base}/columns`, {
        method: 'POST',
        body: JSON.stringify(column),
      })
    },

    /** 修改列类型 */
    async alterColumn(columnName: string, newType: ColumnDef['type']): Promise<{ success: boolean }> {
      return request(`${base}/columns/${encodeURIComponent(columnName)}`, {
        method: 'PUT',
        body: JSON.stringify({ type: newType }),
      })
    },

    /** 删除列 */
    async dropColumn(columnName: string): Promise<{ success: boolean; tableName: string; columnName: string }> {
      return request(`${base}/columns/${encodeURIComponent(columnName)}`, { method: 'DELETE' })
    },
  }
}
