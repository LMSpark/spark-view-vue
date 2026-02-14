/**
 * 业务层网络CRUD服务
 *
 * 基于 spark-utils HTTP客户端，封装标准CRUD操作
 * 与 DataSet/DataTable 深度集成，支持权限和数据转换
 */

import { Request, createRequest, Logger } from '@spark-view/spark-utils'
import type {
  RequestConfig
} from '@spark-view/spark-utils'
import type {
  CrudApi,
  HttpEndpoint,
  IDataRow,
  IDataSource
} from './types'

/**
 * CRUD操作结果
 */
export interface CrudResult<T = unknown> {
  success: boolean
  data?: T
  error?: Error
  message?: string
}

/**
 * 分页查询参数
 */
export interface QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  filter?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * 批量操作结果
 */
export interface BatchResult {
  successCount: number
  failureCount: number
  results: CrudResult[]
  errors: Error[]
}

/**
 * 业务层CRUD服务
 *
 * 封装网络请求，提供类型安全的CRUD操作
 * 自动处理权限、数据转换、分页等业务逻辑
 */
export class CrudService {
  private http: Request
  private logger = Logger('CrudService')

  constructor(
    private api: CrudApi,
    httpConfig?: Partial<RequestConfig>
  ) {
    this.http = httpConfig ? createRequest(httpConfig) : createRequest()
  }

  // ===== 基础CRUD操作 =====

  /**
   * 创建记录
   */
  async create<T = IDataRow>(
    data: Partial<T>,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<T>> {
    if (!this.api.create) {
      return this.errorResult('Create API not configured')
    }

    try {
      const result = await this.executeEndpoint<T>(this.api.create, data, config)
      this.logger.info('记录创建成功', { data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录创建失败', error)
      return this.errorResult('Create failed', error as Error)
    }
  }

  /**
   * 查询单条记录
   */
  async retrieve<T = IDataRow>(
    id: string | number,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<T>> {
    if (!this.api.retrieve) {
      return this.errorResult('Retrieve API not configured')
    }

    try {
      const endpoint = this.resolveEndpoint(this.api.retrieve, { id })
      const result = await this.http.get<T>(endpoint.url, endpoint.params, {
        ...config,
        headers: { ...endpoint.headers, ...config?.headers }
      })
      this.logger.info('记录查询成功', { id, data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录查询失败', { id }, error)
      return this.errorResult('Retrieve failed', error as Error)
    }
  }

  /**
   * 更新记录
   */
  async update<T = IDataRow>(
    id: string | number,
    data: Partial<T>,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<T>> {
    if (!this.api.update) {
      return this.errorResult('Update API not configured')
    }

    try {
      const updateData = { ...data, id }
      const result = await this.executeEndpoint<T>(this.api.update, updateData, config)
      this.logger.info('记录更新成功', { id, data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录更新失败', { id }, error)
      return this.errorResult('Update failed', error as Error)
    }
  }

  /**
   * 删除记录
   */
  async delete(
    id: string | number,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<boolean>> {
    if (!this.api.delete) {
      return this.errorResult('Delete API not configured')
    }

    try {
      await this.executeEndpoint(this.api.delete, { id }, config)
      this.logger.info('记录删除成功', { id })
      return { success: true, data: true }
    } catch (error) {
      this.logger.error('记录删除失败', { id }, error)
      return this.errorResult('Delete failed', error as Error)
    }
  }

  /**
   * 查询列表（支持分页）
   */
  async list<T = IDataSource>(
    params?: QueryParams,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<T>> {
    if (!this.api.list) {
      return this.errorResult('List API not configured')
    }

    try {
      const endpoint = this.api.list
      const queryParams = this.buildQueryParams(params, endpoint)

      const result = await this.http.get<T>(endpoint.url, queryParams, {
        ...config,
        headers: { ...endpoint.headers, ...config?.headers }
      })

      this.logger.info('列表查询成功', { params, count: this.getResultCount(result) })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('列表查询失败', { params }, error)
      return this.errorResult('List failed', error as Error)
    }
  }

  // ===== 批量操作 =====

  /**
   * 批量创建
   */
  async batchCreate<T = IDataRow>(
    items: Partial<T>[],
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.create) {
      return this.errorResult('Batch create API not configured')
    }

    try {
      const results = await this.executeBatch(this.api.batch.create, items, config)
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量创建完成', { total: items.length, success: successCount })
      return {
        success: true,
        data: {
          successCount,
          failureCount: results.length - successCount,
          results,
          errors: results.filter(r => !r.success).map(r => r.error ?? new Error('Batch create failed'))
        }
      }
    } catch (error) {
      this.logger.error('批量创建失败', error)
      return this.errorResult('Batch create failed', error as Error)
    }
  }

  /**
   * 批量更新
   */
  async batchUpdate<T = IDataRow>(
    items: Array<{ id: string | number } & Partial<T>>,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.update) {
      return this.errorResult('Batch update API not configured')
    }

    try {
      const results = await this.executeBatch(this.api.batch.update, items, config)
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量更新完成', { total: items.length, success: successCount })
      return {
        success: true,
        data: {
          successCount,
          failureCount: results.length - successCount,
          results,
          errors: results.filter(r => !r.success).map(r => r.error ?? new Error('Batch update failed'))
        }
      }
    } catch (error) {
      this.logger.error('批量更新失败', error)
      return this.errorResult('Batch update failed', error as Error)
    }
  }

  /**
   * 批量删除
   */
  async batchDelete(
    ids: Array<string | number>,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.delete) {
      return this.errorResult('Batch delete API not configured')
    }

    try {
      const items = ids.map(id => ({ id }))
      const results = await this.executeBatch(this.api.batch.delete, items, config)
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量删除完成', { total: ids.length, success: successCount })
      return {
        success: true,
        data: {
          successCount,
          failureCount: results.length - successCount,
          results,
          errors: results.filter(r => !r.success).map(r => r.error ?? new Error('Batch delete failed'))
        }
      }
    } catch (error) {
      this.logger.error('批量删除失败', error)
      return this.errorResult('Batch delete failed', error as Error)
    }
  }

  // ===== 导入导出 =====

  /**
   * 导入数据
   */
  async importData(
    file: File,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.api.import) {
      return this.errorResult('Import API not configured')
    }

    try {
      const formData = new FormData()
      formData.append('file', file)

      const result = await this.executeEndpoint(this.api.import, formData, {
        ...config,
        headers: {
          'Content-Type': 'multipart/form-data',
          ...config?.headers
        }
      })

      this.logger.info('数据导入成功', result)
      return { success: true, data: result as { imported: number; failed: number } }
    } catch (error) {
      this.logger.error('数据导入失败', error)
      return this.errorResult('Import failed', error as Error)
    }
  }

  /**
   * 导出数据
   */
  async exportData(
    params?: QueryParams,
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<Blob>> {
    if (!this.api.export) {
      return this.errorResult('Export API not configured')
    }

    try {
      const endpoint = this.api.export
      const queryParams = this.buildQueryParams(params, endpoint)

      const result = await this.http.requestFull({
        url: endpoint.url,
        method: endpoint.method ?? 'GET',
        params: queryParams,
        responseType: 'blob',
        ...config,
        headers: { ...endpoint.headers, ...config?.headers }
      })

      this.logger.info('数据导出成功')
      return { success: true, data: result.data as Blob }
    } catch (error) {
      this.logger.error('数据导出失败', error)
      return this.errorResult('Export failed', error as Error)
    }
  }

  // ===== 工具方法 =====

  /**
   * 执行单个端点
   */
  private async executeEndpoint<T>(
    endpoint: HttpEndpoint,
    data?: unknown,
    config?: Partial<RequestConfig>
  ): Promise<T> {
    const resolvedEndpoint = this.resolveEndpoint(endpoint, data)

    switch (endpoint.method) {
      case 'POST':
        return this.http.post<T>(resolvedEndpoint.url, data, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'PUT':
        return this.http.put<T>(resolvedEndpoint.url, data, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'PATCH':
        return this.http.patch<T>(resolvedEndpoint.url, data, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      case 'DELETE':
        return this.http.delete<T>(resolvedEndpoint.url, resolvedEndpoint.params, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
      default: // GET
        return this.http.get<T>(resolvedEndpoint.url, resolvedEndpoint.params, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
    }
  }

  /**
   * 执行批量操作
   */
  private async executeBatch<T>(
    endpoint: HttpEndpoint,
    items: T[],
    config?: Partial<RequestConfig>
  ): Promise<CrudResult<T>[]> {
    const results: CrudResult<T>[] = []

    // 简单的顺序执行，可扩展为并发控制
    for (const item of items) {
      try {
        const result = await this.executeEndpoint<T>(endpoint, item, config)
        results.push({ success: true, data: result })
      } catch (error) {
        results.push(this.errorResult('Batch item failed', error as Error))
      }
    }

    return results
  }

  /**
   * 解析端点（处理路径参数）
   */
  private resolveEndpoint(
    endpoint: HttpEndpoint,
    data?: unknown
  ): { url: string; params?: Record<string, unknown>; headers?: Record<string, string> } {
    let url = endpoint.url
    const params: Record<string, unknown> = { ...endpoint.params }
    const headers = { ...endpoint.headers }

    // 处理路径参数（如 /users/:id）
    if (endpoint.pathParams && data && typeof data === 'object') {
      for (const param of endpoint.pathParams) {
        const value = (data as Record<string, unknown>)[param]
        if (value !== undefined) {
          url = url.replace(`:${param}`, String(value))
        }
      }
    }

    return { url, params, headers }
  }

  /**
   * 构建查询参数（分页、排序等）
   */
  private buildQueryParams(
    params?: QueryParams,
    endpoint?: HttpEndpoint & { pagination?: { pageParam?: string; sizeParam?: string; sortParam?: string } }
  ): Record<string, unknown> {
    const query: Record<string, unknown> = { ...params }

    if (endpoint?.pagination && params) {
      const { pageParam = 'page', sizeParam = 'size', sortParam = 'sort' } = endpoint.pagination

      if (params.page !== undefined) query[pageParam] = params.page
      if (params.pageSize !== undefined) query[sizeParam] = params.pageSize
      if (params.sort !== undefined) query[sortParam] = params.sort
    }

    return query
  }

  /**
   * 获取结果计数（用于日志）
   */
  private getResultCount(result: unknown): number {
    if (result && typeof result === 'object' && 'rows' in result) {
      const rows = (result as { rows?: unknown[] }).rows
      return Array.isArray(rows) ? rows.length : 0
    }
    if (Array.isArray(result)) {
      return result.length
    }
    return 0
  }

  /**
   * 创建错误结果
   */
  private errorResult<T>(message: string, error?: Error): CrudResult<T> {
    return {
      success: false,
      error: error ?? new Error(message),
      message
    }
  }
}

/**
 * 创建CRUD服务工厂函数
 */
export function createCrudService(
  api: CrudApi,
  httpConfig?: Partial<RequestConfig>
): CrudService {
  return new CrudService(api, httpConfig)
}

/**
 * 默认CRUD服务实例（使用默认HTTP配置）
 */
export const defaultCrudService = new CrudService({})