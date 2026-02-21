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
import type { ValidationResult } from '../validation'
import type { ICrudHost, EmitStateChangedFn, EmitCrudLifecycleFn, MutatingFn, CrudOperation } from './types'
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
    private emitStateChanged: EmitStateChangedFn,
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
  // CrudService 获取（DataTable 持有）
  // ─────────────────────────────────────────────

  /** 确保 CrudService 已初始化（从 DataTable 获取），否则抛出 */
  ensureCrudService(): CrudService {
    const svc = this.host.dataTable?.crudService
    if (!svc) throw new Error(`Table ${this.host.dataTable?.tableName ?? '?'} has no API configuration`)
    return svc
  }

  // ─────────────────────────────────────────────
  // 配置 & 校验
  // ─────────────────────────────────────────────

  /** 获取 CRUD 操作配置（超时、重试等） */
  getCrudConfig(): CrudOperationConfig | undefined {
    return this.host.dataTable?.crudConfig
  }

  /** 校验数据行 */
  private validateRow(row: IDataRow): ValidationResult | null {
    if (!this.host.dataTable?.validator) return null
    return this.host.dataTable.validator.validate(row)
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

    const validationResult = this.validateRow(data as IDataRow)
    if (validationResult && !validationResult.valid) {
      return {
        success: false,
        message: `数据校验失败: ${validationResult.errors[0]?.message ?? '未知错误'}`,
        error: new Error(validationResult.errors[0]?.message ?? '数据校验失败')
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.create<IDataRow>(data, this.getCrudConfig())
      if (result.success && result.data) {
        this.host.appendRow(result.data)
        this.emitStateChanged('rows')
      }
      this.fireAfter('create', data, result)
      return result
    })
  }

  /** 更新记录，成功后刷新对应行 */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    if (!this.fireBefore('update', { id, ...data })) return this.cancelledResult('update')

    const validationResult = this.validateRow(data as IDataRow)
    if (validationResult && !validationResult.valid) {
      return {
        success: false,
        message: `数据校验失败: ${validationResult.errors[0]?.message ?? '未知错误'}`,
        error: new Error(validationResult.errors[0]?.message ?? '数据校验失败')
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.update<IDataRow>(id, data, this.getCrudConfig())
      if (result.success && result.data && this.host.updateRowById(id, result.data)) {
        this.emitStateChanged('rows')
      }
      this.fireAfter('update', { id, ...data }, result)
      return result
    })
  }

  /** 删除记录，成功后从 rows 移除 */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    if (!this.fireBefore('delete', { id })) return this.cancelledResult('delete')

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.delete(id, this.getCrudConfig())
      if (result.success && this.host.deleteRowById(id)) {
        this.emitStateChanged('rows')
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

    const validationErrors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const validationResult = this.validateRow(items[i] as IDataRow)
      if (validationResult && !validationResult.valid) {
        validationErrors.push(`第${i + 1}条: ${validationResult.errors[0]?.message ?? '校验失败'}`)
      }
    }
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.batchCreate<IDataRow>(items, this.getCrudConfig())
      if (result.success && result.data) {
        for (const r of result.data.results) {
          if (r.success && r.data) this.host.appendRow(r.data as IDataRow)
        }
        this.emitStateChanged('rows')
      }
      this.fireAfter('batchCreate', items, result)
      return result
    })
  }

  /** 批量更新 */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
    if (!this.fireBefore('batchUpdate', items)) return this.cancelledResult('batchUpdate')

    const validationErrors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const validationResult = this.validateRow(items[i] as IDataRow)
      if (validationResult && !validationResult.valid) {
        validationErrors.push(`第${i + 1}条: ${validationResult.errors[0]?.message ?? '校验失败'}`)
      }
    }
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `批量数据校验失败: ${validationErrors.join('; ')}`,
        error: new Error(validationErrors[0])
      }
    }

    return this.withMutating(async () => {
      const svc = this.ensureCrudService()
      const result = await svc.batchUpdate<IDataRow>(items, this.getCrudConfig())
      if (result.success && result.data) {
        for (const r of result.data.results) {
          if (r.success && r.data) {
            const record = r.data as IDataRow
            const id = (record as { id?: unknown }).id
            if (id !== undefined) this.host.updateRowById(id as string | number, record)
          }
        }
        this.emitStateChanged('rows')
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
      const result = await svc.batchDelete(ids, this.getCrudConfig())

      if (result.success && result.data) {
        const successIds = new Set<string | number>()
        result.data.results.forEach((r, i) => {
          const id = ids[i]
          if (r.success && id !== undefined) successIds.add(id)
        })

        let deletedCount = 0
        for (const id of successIds) {
          if (this.host.deleteRowById(id)) deletedCount++
        }

        if (result.data.failureCount > 0) {
          logger.warn(`批量删除部分失败: ${result.data.failureCount}/${ids.length}`, {
            successCount: result.data.successCount,
            failureCount: result.data.failureCount
          })
        }

        if (deletedCount > 0) {
          this.emitStateChanged('rows')
        }
      }

      this.fireAfter('batchDelete', ids, result)
      return result
    })
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
        await this.host.requestData()
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
