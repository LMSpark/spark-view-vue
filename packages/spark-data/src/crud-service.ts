/**
 * 业务层网络CRUD服务
 *
 * 基于 spark-utils HTTP客户端，封装标准CRUD操作
 * 与 DataSet/DataTable 深度集成，支持权限和数据转换
 */

import { type Request, createRequest, Logger } from '@spark-view/spark-utils'
import type {
  RequestConfig
} from '@spark-view/spark-utils'
import type {
  CrudApi,
  HttpEndpoint,
  IDataRow,
  IDataSource,
  CrudResult,
  QueryParams,
  BatchResult,
  CrudOperationConfig,
} from './types'
import {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD
} from './types'
import { resolveUrlTemplate } from './core/url-template'

// ===== 接口定义 =====

// 接口已在 types.ts 中定义，此处不再重复

/**
 * 业务层CRUD服务
 *
 * 封装网络请求，提供类型安全的CRUD操作
 * 自动处理权限、数据转换、分页等业务逻辑
 */
export class CrudService {
  private http: Request
  private logger = Logger('CrudService')

  // ===== 构造函数 =====

  /**
   * 创建CRUD服务实例
   * @param api CRUD API配置
   * @param httpConfigOrClient 可选：HTTP 客户端配置对象 **或** 已有 Request 实例（共享 auth/拦截器）
   */
  constructor(
    private api: CrudApi,
    httpConfigOrClient?: Partial<RequestConfig> | Request
  ) {
    if (httpConfigOrClient && typeof (httpConfigOrClient as Request).get === 'function') {
      // M5: 传入现有 Request 实例，跳过 createRequest（共享 auth/拦截器）
      this.http = httpConfigOrClient as Request
    } else {
      this.http = httpConfigOrClient
        ? createRequest(httpConfigOrClient as Partial<RequestConfig>)
        : createRequest()
    }
  }

  /**
   * 获取内部 HTTP 客户端实例（供 TreeManager 等模块共享拦截器/认证/配置）
   *
   * @returns Request 实例
   */
  getHttpClient(): Request {
    return this.http
  }

  // ===== 基础CRUD操作 =====

  /**
   * 创建记录
   * @param data 记录数据
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async create<T = IDataRow>(
    data: Partial<T>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.create) {
      return this.errorResult('Create API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedData = this.sanitizeDataForUpload(data)
      const result = await this.executeEndpoint<T>(this.api.create, sanitizedData, requestConfig)
      this.logger.info('记录创建成功', { data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录创建失败', error)
      return this.errorResult('Create failed', error as Error)
    }
  }

  /**
   * 查询单条记录
   * @param pk 服务端 PK payload（如 { id: 1 } 或 { orderId: 1, productId: 10 }）
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async retrieve<T = IDataRow>(
    pk: Record<string, unknown>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.retrieve) {
      return this.errorResult('Retrieve API not configured')
    }

    try {
      const endpoint = this.resolveEndpoint(this.api.retrieve, pk)
      const requestConfig = this.buildRequestConfig(config)
      const result = await this.http.get<T>(endpoint.url, endpoint.params, {
        ...requestConfig,
        headers: { ...endpoint.headers, ...requestConfig?.headers }
      })
      this.logger.info('记录查询成功', { pk, data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录查询失败', { pk }, error)
      return this.errorResult('Retrieve failed', error as Error)
    }
  }

  /**
   * 更新记录
   * @param pk 服务端 PK payload（如 { id: 1 } 或 { orderId: 1, productId: 10 }）
   * @param data 更新数据
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async update<T = IDataRow>(
    pk: Record<string, unknown>,
    data: Partial<T>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.update) {
      return this.errorResult('Update API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedData = this.sanitizeDataForUpload(data)
      const updateData = { ...sanitizedData, ...pk }
      const result = await this.executeEndpoint<T>(this.api.update, updateData, requestConfig)
      this.logger.info('记录更新成功', { pk, data: result })
      return { success: true, data: result }
    } catch (error) {
      this.logger.error('记录更新失败', { pk }, error)
      return this.errorResult('Update failed', error as Error)
    }
  }

  /**
   * 删除记录
   * @param pk 服务端 PK payload（如 { id: 1 } 或 { orderId: 1, productId: 10 }）
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async delete(
    pk: Record<string, unknown>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<boolean>> {
    if (!this.api.delete) {
      return this.errorResult('Delete API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      await this.executeEndpoint(this.api.delete, pk, requestConfig)
      this.logger.info('记录删除成功', { pk })
      return { success: true, data: true }
    } catch (error) {
      this.logger.error('记录删除失败', { pk }, error)
      return this.errorResult('Delete failed', error as Error)
    }
  }

  /**
   * 查询列表（支持分页）
   * @param params 查询参数（包含权限令牌）
   * @param config CRUD操作配置（包含权限快照）
   * @returns CRUD操作结果
   */
  async list<T = IDataSource>(
    params?: QueryParams,
    config?: CrudOperationConfig
  ): Promise<CrudResult<T>> {
    if (!this.api.list) {
      return this.errorResult('List API not configured')
    }

    try {
      const endpoint = this.api.list
      const queryParams = this.buildQueryParams(params, endpoint)
      const requestConfig = this.buildRequestConfig(config)

      const result = await this.http.get<T>(endpoint.url, queryParams, {
        ...requestConfig,
        headers: { ...endpoint.headers, ...requestConfig?.headers }
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
   * @param items 记录数据数组
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchCreate<T = IDataRow>(
    items: Partial<T>[],
    config?: CrudOperationConfig
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.create) {
      return this.errorResult('Batch create API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedItems = items.map(item => this.sanitizeDataForUpload(item))
      const results = await this.executeBatch(this.api.batch.create, sanitizedItems, requestConfig)
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量创建完成', { total: items.length, success: successCount })
      return this.buildBatchResult(results, successCount)
    } catch (error) {
      this.logger.error('批量创建失败', error)
      return this.errorResult('Batch create failed', error as Error)
    }
  }

  /**
   * 批量更新
   * @param items 更新数据数组（必须包含主键字段）
   * @param config CRUD操作配置（包含权限快照）
   * @returns 批量操作结果
   */
  async batchUpdate<T = IDataRow>(
    items: Array<Partial<T>>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.update) {
      return this.errorResult('Batch update API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const sanitizedItems = items.map(item => this.sanitizeDataForUpload(item as Record<string, unknown>))
      const results = await this.executeBatch(this.api.batch.update, sanitizedItems, requestConfig)
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量更新完成', { total: items.length, success: successCount })
      return this.buildBatchResult(results, successCount)
    } catch (error) {
      this.logger.error('批量更新失败', error)
      return this.errorResult('Batch update failed', error as Error)
    }
  }

  /**
   * 批量删除
   * @param pks 服务端 PK payload 数组（如 [{ id: 1 }, { id: 2 }]）
   * @param config 请求配置
   * @returns 批量操作结果
   */
  async batchDelete(
    pks: Array<Record<string, unknown>>,
    config?: CrudOperationConfig
  ): Promise<CrudResult<BatchResult>> {
    if (!this.api.batch?.delete) {
      return this.errorResult('Batch delete API not configured')
    }

    try {
      const requestConfig = this.buildRequestConfig(config)
      const results = await this.executeBatch(this.api.batch.delete, pks, requestConfig)
      const successCount = results.filter(r => r.success).length
      this.logger.info('批量删除完成', { total: pks.length, success: successCount })
      return this.buildBatchResult(results, successCount)
    } catch (error) {
      this.logger.error('批量删除失败', error)
      return this.errorResult('Batch delete failed', error as Error)
    }
  }

  // ===== 导入导出 =====

  /**
   * 导入数据
   * @param file 上传的文件
   * @param config 请求配置
   * @returns 导入结果
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

      // 不要手动设置 Content-Type：浏览器 / HTTP 客户端会自动添加 boundary
      const result = await this.executeEndpoint(this.api.import, formData, {
        ...config,
        headers: {
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
   * @param params 导出参数
   * @param config CRUD操作配置（包含权限快照）
   * @returns 导出结果（Blob）
   */
  async exportData(
    params?: QueryParams,
    config?: CrudOperationConfig
  ): Promise<CrudResult<Blob>> {
    if (!this.api.export) {
      return this.errorResult('Export API not configured')
    }

    try {
      const endpoint = this.api.export
      const queryParams = this.buildQueryParams(params, endpoint)
      const requestConfig = this.buildRequestConfig(config)

      const result = await this.http.requestFull({
        url: endpoint.url,
        method: endpoint.method ?? 'GET',
        params: queryParams,
        responseType: 'blob',
        ...requestConfig,
        headers: { ...endpoint.headers, ...requestConfig?.headers }
      })

      this.logger.info('数据导出成功')
      return { success: true, data: result.data as Blob }
    } catch (error) {
      this.logger.error('数据导出失败', error)
      return this.errorResult('Export failed', error as Error)
    }
  }

  // ===== 私有工具方法 =====

  /**
   * 清理数据中的权限字段（用于上传数据）
   * @param data 原始数据
   * @returns 清理后的数据（不含权限字段）
   */
  private sanitizeDataForUpload<T extends Record<string, unknown>>(data: T): Omit<T, typeof INSTANCE_PERMISSION_FIELD | typeof MODEL_PERMISSION_FIELD> {
    const sanitized = { ...data }
    delete sanitized[INSTANCE_PERMISSION_FIELD]
    delete sanitized[MODEL_PERMISSION_FIELD]
    return sanitized
  }

  /**
   * 构建请求配置（集成权限快照）
   * @param config CRUD操作配置
   * @returns HTTP请求配置
   */
  private buildRequestConfig(config?: CrudOperationConfig): Partial<RequestConfig> | undefined {
    if (!config) return undefined

    const headers: Record<string, string> = {}

    // 添加权限令牌到请求头
    if (config.modelPermission?.permissionToken) {
      headers['X-Permission-Token'] = config.modelPermission.permissionToken
    }

    // 如果有实例级权限快照，也添加到请求头
    if (config.instancePermission?.permissionToken) {
      headers['X-Instance-Permission-Token'] = config.instancePermission.permissionToken
    }

    const result: Partial<RequestConfig> = {}

    // 只在有实际 header 时才附加，避免传递空 headers 对象
    if (Object.keys(headers).length > 0) {
      result.headers = headers
    }

    if (config.timeout !== undefined) {
      result.timeout = config.timeout
    }

    return result
  }

  /**
   * 执行单个端点
   * @param endpoint HTTP端点配置
   * @param data 请求数据
   * @param config 请求配置
   * @returns 响应数据
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
      case 'GET':
      case undefined:
      default:
        return this.http.get<T>(resolvedEndpoint.url, resolvedEndpoint.params, {
          ...config,
          headers: { ...resolvedEndpoint.headers, ...config?.headers }
        })
    }
  }

  /**
   * 执行批量操作（真滑动窗口并发控制）
   *
   * 与固定批次 Promise.all 不同，此实现在任意一个请求完成后**立即**
   * 启动队列中的下一个，始终保持 concurrency 个在途请求，吞吐量更高。
   *
   * @param endpoint HTTP端点配置
   * @param items 数据项数组
   * @param config 请求配置
   * @param concurrency 最大并发数（默认5）
   * @param onProgress 进度回调 (completed, total) => void
   * @returns 批量操作结果数组（顺序与 items 一致）
   */
  private async executeBatch<T>(
    endpoint: HttpEndpoint,
    items: T[],
    config?: Partial<RequestConfig>,
    concurrency = 5,
    onProgress?: (completed: number, total: number) => void
  ): Promise<CrudResult<T>[]> {
    const results: CrudResult<T>[] = new Array(items.length).fill(null) as CrudResult<T>[]
    let nextIndex = 0
    let completed = 0

    const executeNext = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const i = nextIndex++
        const item = items[i]
        if (item === undefined) continue

        try {
          const result = await this.executeEndpoint<T>(endpoint, item, config)
          results[i] = { success: true, data: result }
        } catch (error) {
          this.logger.error(`批量操作项 ${i} 失败`, error)
          results[i] = this.errorResult('Batch item failed', error as Error)
        } finally {
          completed++
          onProgress?.(completed, items.length)
        }
      }
    }

    // 启动 min(concurrency, items.length) 个 worker，每个 worker 完成后立即取下一项
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => executeNext()
    )
    await Promise.all(workers)

    return results
  }

  /**
   * 解析端点（处理路径参数）
   * @param endpoint HTTP端点配置
   * @param data 数据对象
   * @returns 解析后的端点信息
   */
  private resolveEndpoint(
    endpoint: HttpEndpoint,
    data?: unknown
  ): { url: string; params?: Record<string, unknown>; headers?: Record<string, string> } {
    const params: Record<string, unknown> = { ...endpoint.params }
    const headers = { ...endpoint.headers }

    // 使用统一的 URL 模板解析（支持 :param 和 {param} 两种风格）
    let url = endpoint.url
    if (endpoint.pathParams && data && typeof data === 'object') {
      const pathData: Record<string, unknown> = {}
      for (const param of endpoint.pathParams) {
        const value = (data as Record<string, unknown>)[param]
        if (value !== undefined) pathData[param] = value
      }
      const resolved = resolveUrlTemplate(url, pathData)
      url = resolved.url
    }

    return { url, params, headers }
  }

  /**
   * 构建查询参数（分页、排序等）
   * @param params 查询参数
   * @param endpoint 端点配置
   * @returns 查询参数对象
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
   * @param result 结果数据
   * @returns 数据项数量
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

  /** 构建批量操作结果（单次遍历收集 errors）*/
  private buildBatchResult<T>(results: CrudResult<T>[], successCount: number): CrudResult<BatchResult> {
    const errors: Error[] = []
    for (const r of results) {
      if (!r.success) errors.push(r.error ?? new Error('Batch operation failed'))
    }
    return {
      success: true,
      data: {
        successCount,
        failureCount: results.length - successCount,
        results: results as CrudResult[],
        errors
      }
    }
  }

  /**
   * 创建错误结果
   * @param message 错误消息
   * @param error 错误对象
   * @returns 错误结果
   */
  private errorResult<T>(message: string, error?: Error): CrudResult<T> {
    return {
      success: false,
      error: error ?? new Error(message),
      message
    }
  }

}

// ===== 工厂函数 =====

/**
 * 创建CRUD服务工厂函数
 * @param api CRUD API配置
 * @param httpConfigOrClient HTTP 客户端配置 **或** 已有 Request 实例（共享 auth/拦截器）
 * @returns CrudService实例
 */
export function createCrudService(
  api: CrudApi,
  httpConfigOrClient?: Partial<RequestConfig> | Request
): CrudService {
  return new CrudService(api, httpConfigOrClient)
}