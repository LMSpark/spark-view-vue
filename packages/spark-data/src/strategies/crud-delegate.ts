/**
 * CrudDelegate — CRUD 操作委托
 *
 * 从 DataView 提取的 CRUD 职责：
 * - 单条 CRUD（create/update/delete）
 * - 批量 CRUD（batchCreate/batchUpdate/batchDelete）
 * - 导入/导出（importData/exportData）
 * - 数据校验代理
 * - CRUD 生命周期事件（before/after hooks）
 *
 * 通过 ICrudHost 接口与宿主（DataView）交互，
 * 不直接依赖 DataView 类（避免循环引用）。
 *
 * CrudService 实例由 DataTable 持有并缓存（模型级共享）。
 */

import { Logger } from '@spark-view/spark-utils'
import type { CrudService } from '../crud-service'
import type {
  IDataRow, CrudResult, BatchResult,
  CrudOperationConfig, QueryParams,
} from '../types'
import type { ValidationResult, ValidationError } from '../validation'
import type { ICrudHost, EmitCrudLifecycleFn, MutatingFn, CrudOperation } from './types'
import { createCrudLifecycleEvent } from './types'

const logger = Logger('DataView:CRUD')

/**
 * CRUD 委托
 *
 * 封装所有 CRUD 相关逻辑，包括数据校验、单条 & 批量操作、导入导出。
 * CrudService 由 DataTable 持有，本委托通过 host.dataTable 获取。
 * 每个操作前后发射 crud:before / crud:after 事件，供业务脚本层拦截和联动。
 */
export class CrudDelegate {

  constructor(
    private host: ICrudHost,
    private emitCrudLifecycle: EmitCrudLifecycleFn,
    private emitMutating: MutatingFn,
  ) {}

  /**
   * 包装网络变更操作：emitMutating(+1) → 执行 → emitMutating(-1)
   * 仅在 fireBefore 通过、校验通过后调用，不追踪取消/校验失败。
   */
  private async withMutating<T>(fn: () => Promise<T>): Promise<T> {
    this.emitMutating(1)
    let caughtError: Error | null = null
    try {
      return await fn()
    } catch (error) {
      caughtError = error instanceof Error ? error : new Error(String(error))
      throw error
    } finally {
      this.emitMutating(-1, caughtError)
    }
  }

  // ─────────────────────────────────────────────
  // CrudService 获取
  // ─────────────────────────────────────────────

  /** 确保 CrudService 已初始化，否则抛出 */
  ensureCrudService(): CrudService {
    const svc = this.host.crudService
    if (!svc) throw new Error(`Table ${this.host.tableName} has no API configuration`)
    return svc
  }

  // ─────────────────────────────────────────────
  // 配置 & 校验
  // ─────────────────────────────────────────────

  /** 获取 CRUD 操作配置（超时、重试等） */
  getCrudConfig(): CrudOperationConfig | undefined {
    return this.host.crudConfig
  }

  /** 从数据中剥离计算列字段（提交前调用） */
  private stripComputed(data: Partial<IDataRow>): Partial<IDataRow> {
    return this.host.stripComputedColumns(data)
  }

  /** 批量剥离计算列 */
  private stripComputedBatch(items: Partial<IDataRow>[]): Partial<IDataRow>[] {
    if (this.host.computedColumnNames.size === 0) return items
    return items.map(item => this.host.stripComputedColumns(item))
  }

  /** 校验数据行 */
  private validateRow(row: IDataRow): ValidationResult | null {
    if (!this.host.validator) return null
    return this.host.validator.validate(row)
  }

  // ─────────────────────────────────────────────
  // 生命周期事件辅助
  // ─────────────────────────────────────────────

  /**
   * 发射 before 事件，返回是否继续执行
   * @returns `true` = 继续执行，`false` = 已取消
   */
  private fireBefore(operation: CrudOperation, data: unknown): boolean {
    const event = createCrudLifecycleEvent(operation, 'before', data)
    this.emitCrudLifecycle(event)
    return !event.cancelled
  }

  /** 发射 after 事件（通知性质，不可取消） */
  private fireAfter(operation: CrudOperation, data: unknown, result: CrudResult): void {
    const event = createCrudLifecycleEvent(operation, 'after', data, result)
    this.emitCrudLifecycle(event)
  }

  /** 创建取消结果 */
  private cancelledResult<T>(operation: string): CrudResult<T> {
    return { success: false, message: `${operation} cancelled by before hook` }
  }

  /** 创建校验失败结果（消除 createRecord/updateRecord 中的重复块） */
  private validationFailedResult<T>(errors: ValidationError[]): CrudResult<T> {
    const msg = errors[0]?.message ?? '数据校验失败'
    return {
      success: false,
      message: `数据校验失败: ${msg}`,
      error: new Error(msg)
    }
  }

  /** 批量校验所有行，返回错误消息列表（消除 batchCreateRecords/batchUpdateRecords 中的重复循环） */
  private collectBatchValidationErrors(items: Partial<IDataRow>[]): string[] {
    const errors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const result = this.validateRow(items[i] as IDataRow)
      if (result && !result.valid) {
        errors.push(`第${i + 1}条: ${result.errors[0]?.message ?? '校验失败'}`)
      }
    }
    return errors
  }

  // ─────────────────────────────────────────────
  // 列表查询（供 DataView.loadFromServer 使用）
  // ─────────────────────────────────────────────

  /** 执行列表查询 */
  async list(params?: QueryParams): Promise<CrudResult> {
    return this.ensureCrudService().list(params, this.getCrudConfig())
  }

  // ─────────────────────────────────────────────
  // 单条 CRUD
  // ─────────────────────────────────────────────

  /** 新增记录，成功后追加至 rows */
  async createRecord(data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    if (!this.fireBefore('create', data)) return this.cancelledResult('create')

    const cleanData = this.stripComputed(data)
    const validationResult = this.validateRow(cleanData as IDataRow)
    if (validationResult && !validationResult.valid) {
      return this.validationFailedResult(validationResult.errors)
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.create<IDataRow>(cleanData, this.getCrudConfig())
      if (result.success && result.data) {
        this.host.appendRow(result.data)   // appendRow 内部已发射 stateChanged('rows')
      }
      this.fireAfter('create', data, result)
      return result
    })
  }

  /**
   * 更新记录，成功后刷新对应行
   * @param id 本地主键值（用于本地 rows 更新）
   * @param data 更新数据
   * @param serverPk 服务端 PK payload（用于 HTTP 请求，可选，默认从 id 构建）
   */
  async updateRecord(
    id: string | number,
    data: Partial<IDataRow>,
    serverPk?: Record<string, unknown>,
  ): Promise<CrudResult<IDataRow>> {
    if (!this.fireBefore('update', { id, ...data })) return this.cancelledResult('update')

    const cleanData = this.stripComputed(data)
    const validationResult = this.validateRow(cleanData as IDataRow)
    if (validationResult && !validationResult.valid) {
      return this.validationFailedResult(validationResult.errors)
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const pk = serverPk ?? { [this.host.primaryKey]: id }
      const result = await svc.update<IDataRow>(pk, cleanData, this.getCrudConfig())
      if (result.success && result.data) {
        this.host.updateRowById(id, result.data)
      }
      this.fireAfter('update', { id, ...data }, result)
      return result
    })
  }

  /**
   * 删除记录，成功后从 rows 移除
   * @param id 本地主键值
   * @param serverPk 服务端 PK payload（用于 HTTP 请求，可选，默认从 id 构建）
   */
  async deleteRecord(
    id: string | number,
    serverPk?: Record<string, unknown>,
  ): Promise<CrudResult<boolean>> {
    if (!this.fireBefore('delete', { id })) return this.cancelledResult('delete')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const pk = serverPk ?? { [this.host.primaryKey]: id }
      const result = await svc.delete(pk, this.getCrudConfig())
      if (result.success) {
        this.host.deleteRowById(id)
      }
      this.fireAfter('delete', { id }, result)
      return result
    })
  }

  // ─────────────────────────────────────────────
  // 批量 CRUD
  // ─────────────────────────────────────────────

  /** 批量新增 */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchCreate', items)) return this.cancelledResult('batchCreate')

    const cleanItems = this.stripComputedBatch(items)
    const validationErrors = this.collectBatchValidationErrors(cleanItems)
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.batchCreate<IDataRow>(cleanItems, this.getCrudConfig())
      if (result.success && result.data) {
        for (const r of result.data.results) {
          if (r.success && r.data) this.host.appendRow(r.data as IDataRow)  // 每行 appendRow 内部已发射（防抖合并）
        }
      }
      this.fireAfter('batchCreate', items, result)
      return result
    })
  }

  /** 批量更新（items 中必须包含主键字段，主键名由 host.primaryKey 决定） */
  async batchUpdateRecords(items: Array<Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchUpdate', items)) return this.cancelledResult('batchUpdate')

    const cleanItems = this.stripComputedBatch(items)
    const validationErrors = this.collectBatchValidationErrors(cleanItems)
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.batchUpdate<IDataRow>(cleanItems, this.getCrudConfig())
      if (result.success && result.data) {
        for (const r of result.data.results) {
          if (r.success && r.data) {
            const record = r.data as IDataRow
            const id = this.host.getPkKey(record)
            if (id !== undefined) this.host.updateRowById(id, record)  // updateRowById 内部已发射
          }
        }
      }
      this.fireAfter('batchUpdate', items, result)
      return result
    })
  }

  /** 批量删除 */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchDelete', ids)) return this.cancelledResult('batchDelete')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      // 构建服务端 PK payload 数组
      const pkPayloads = ids.map(id => this._buildServerPkFromId(id))
      const result = await svc.batchDelete(pkPayloads, this.getCrudConfig())

      if (result.success && result.data) {
        const successIds = new Set<string | number>()
        for (const [i, r] of result.data.results.entries()) {
          const id = ids[i]
          if (r.success && id !== undefined) {
            successIds.add(id)
          }
        }

        for (const id of successIds) {
          this.host.deleteRowById(id)
        }

        if (result.data.failureCount > 0) {
          logger.warn(`批量删除部分失败: ${result.data.failureCount}/${ids.length}`, {
            successCount: result.data.successCount,
            failureCount: result.data.failureCount
          })
        }
      }

      this.fireAfter('batchDelete', ids, result)
      return result
    })
  }

  // ─────────────────────────────────────────────
  // Server PK 构建辅助
  // ─────────────────────────────────────────────

  /**
   * 从本地 ID 构建服务端 PK payload。
   * 尝试从 rows 中查找行以提取真实 PK 字段，否则回退到单字段。
   */
  private _buildServerPkFromId(id: string | number): Record<string, unknown> {
    const row = this.host.rows.find(r => this.host.getPkKey(r) === id)
    if (row) {
      const result: Record<string, unknown> = {}
      for (const f of this.host.effectivePkFields) result[f] = row[f]
      return result
    }
    return { [this.host.primaryKey]: id }
  }

  // ─────────────────────────────────────────────
  // 导入 / 导出
  // ─────────────────────────────────────────────

  /** 导入文件，成功后重置状态并重新走完整编排 */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    if (!this.fireBefore('import', file)) return this.cancelledResult('import')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.importData(file)
      if (result.success) {
        this.host.resetState()
        // fire-and-forget：结果经 stateChanged 事件通知；捕获异常防止 unhandled rejection
        Promise.resolve(this.host.requestData()).catch((e: unknown) =>
          logger.error('importData 后 requestData 失败', e)
        )
      }
      this.fireAfter('import', file, result)
      return result
    })
  }

  /** 导出数据 */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    return this.ensureCrudService().exportData(params)
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁 — CrudService 由 DataTable 管理，此处无需释放 */
  destroy(): void {
    // CrudService 归属 DataTable，delegate 无持有
  }
}
