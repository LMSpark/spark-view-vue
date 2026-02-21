/**
 * CrudDelegate — CRUD 操作委托
 *
 * 从 DataView 提取的 CRUD 职责：
 * - 单条 CRUD（create/update/delete）
 * - 批量 CRUD（batchCreate/batchUpdate/batchDelete）
 * - 导入/导出（importData/exportData）
 * - CrudService 生命周期管理
 * - 数据校验代理
 *
 * 通过 ICrudHost 接口与宿主（DataView）交互，
 * 不直接依赖 DataView 类（避免循环引用）。
 */

import { Logger } from '@spark-view/spark-utils'
import { CrudService, createCrudService } from '../crud-service'
import type {
  IDataRow, CrudResult, BatchResult,
  CrudOperationConfig, QueryParams,
} from '../types'
import type { ValidationResult } from '../validation'
import type { ICrudHost, EmitStateChangedFn } from './types'

const logger = Logger('DataView:CRUD')

/**
 * CRUD 委托
 *
 * 封装所有 CRUD 相关逻辑，包括 CrudService 懒初始化、
 * 数据校验、单条 & 批量操作、导入导出。
 */
export class CrudDelegate {
  private crudService?: CrudService | undefined

  constructor(
    private host: ICrudHost,
    private emit: EmitStateChangedFn,
  ) {}

  // ─────────────────────────────────────────────
  // CrudService 生命周期
  // ─────────────────────────────────────────────

  /** 懒初始化 CrudService */
  private initializeCrudService(): void {
    if (!this.host.dataTable?.api) return
    this.crudService = createCrudService(this.host.dataTable.api)
  }

  /** 确保 CrudService 已初始化，否则抛出 */
  ensureCrudService(): CrudService {
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) throw new Error(`Table ${this.host.dataTable?.tableName ?? '?'} has no API configuration`)
    return this.crudService
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
    const validationResult = this.validateRow(data as IDataRow)
    if (validationResult && !validationResult.valid) {
      return {
        success: false,
        message: `数据校验失败: ${validationResult.errors[0]?.message ?? '未知错误'}`,
        error: new Error(validationResult.errors[0]?.message ?? '数据校验失败')
      }
    }

    const svc = this.ensureCrudService()
    const result = await svc.create<IDataRow>(data, this.getCrudConfig())
    if (result.success && result.data) {
      this.host.appendRow(result.data)
      this.emit('rows')
    }
    return result
  }

  /** 更新记录，成功后刷新对应行 */
  async updateRecord(id: string | number, data: Partial<IDataRow>): Promise<CrudResult<IDataRow>> {
    const validationResult = this.validateRow(data as IDataRow)
    if (validationResult && !validationResult.valid) {
      return {
        success: false,
        message: `数据校验失败: ${validationResult.errors[0]?.message ?? '未知错误'}`,
        error: new Error(validationResult.errors[0]?.message ?? '数据校验失败')
      }
    }

    const svc = this.ensureCrudService()
    const result = await svc.update<IDataRow>(id, data, this.getCrudConfig())
    if (result.success && result.data && this.host.updateRowById(id, result.data)) {
      this.emit('rows')
    }
    return result
  }

  /** 删除记录，成功后从 rows 移除 */
  async deleteRecord(id: string | number): Promise<CrudResult<boolean>> {
    const svc = this.ensureCrudService()
    const result = await svc.delete(id, this.getCrudConfig())
    if (result.success && this.host.deleteRowById(id)) {
      this.emit('rows')
    }
    return result
  }

  // ─────────────────────────────────────────────
  // 批量 CRUD
  // ─────────────────────────────────────────────

  /** 批量新增 */
  async batchCreateRecords(items: Partial<IDataRow>[]): Promise<CrudResult<BatchResult>> {
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

    const svc = this.ensureCrudService()
    const result = await svc.batchCreate<IDataRow>(items, this.getCrudConfig())
    if (result.success && result.data) {
      for (const r of result.data.results) {
        if (r.success && r.data) this.host.appendRow(r.data as IDataRow)
      }
      this.emit('rows')
    }
    return result
  }

  /** 批量更新 */
  async batchUpdateRecords(items: Array<{ id: string | number } & Partial<IDataRow>>): Promise<CrudResult<BatchResult>> {
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
      this.emit('rows')
    }
    return result
  }

  /** 批量删除 */
  async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
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
        this.emit('rows')
      }
    }

    return result
  }

  // ─────────────────────────────────────────────
  // 导入 / 导出
  // ─────────────────────────────────────────────

  /** 导入文件，成功后重置状态并重新走完整编排 */
  async importData(file: File): Promise<CrudResult<{ imported: number; failed: number }>> {
    const svc = this.ensureCrudService()
    const result = await svc.importData(file)
    if (result.success) {
      this.host.resetState()
      await this.host.requestData()
    }
    return result
  }

  /** 导出数据 */
  async exportData(params?: QueryParams): Promise<CrudResult<Blob>> {
    return this.ensureCrudService().exportData(params)
  }

  // ─────────────────────────────────────────────
  // 生命周期
  // ─────────────────────────────────────────────

  /** 销毁 — 释放 CrudService 引用 */
  destroy(): void {
    this.crudService = undefined
  }
}
