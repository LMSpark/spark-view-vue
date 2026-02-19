# SPARK-DATA 改进实施计划

> **基于**: [SPARK_DATA_DEEP_ANALYSIS.md](./SPARK_DATA_DEEP_ANALYSIS.md)  
> **目标**: 分阶段修复数据一致性、并发控制、内存管理问题  
> **执行日期**: 2026年2月19日起

---

## � 执行状态

| Phase | 状态 | 完成日期 | Commit |
|-------|------|---------|--------|
| Phase 1: 数据一致性修复 | ✅ 完成 | 2026-02-19 | [a93ceeb](../../../commit/a93ceeb) |
| Phase 2: 并发控制 | 🔄 待执行 | - | - |
| Phase 3: 内存管理 | 🔄 待执行 | - | - |
| Phase 4: 性能优化 | 🔄 待执行 | - | - |
| Phase 5: 增强功能 | 🔄 待执行 | - | - |

**测试验证**: ✅ 148/148 passed | ✅ 0 TypeScript errors | ✅ 0 ESLint warnings

---

## 📋 Phase 1: 数据一致性修复（P0，预计 1-2 天）✅ 已完成

### 1.1 修复 deleteRowById 不清理选中状态

**文件**: `packages/spark-data/src/data-view.ts`

**变更点**:
- [x] `deleteRowById()` - 删除行时清理 `currentRow` 和 `selectedRows`
- [x] `updateRowById()` - 更新行时同步更新选中项引用
- [x] 添加 `cleanupSelectionAfterDelete()` 私有方法

**测试用例**:
```typescript
describe('DataView - 选中状态清理', () => {
  it('删除当前行时应清空 currentRow', () => {
    const view = createTestView()
    view.rows = [{ id: 1 }, { id: 2 }]
    view.setCurrentRow(view.rows[0])
    
    view.deleteRowById(1)
    
    expect(view.currentRow).toBeNull()
    expect(view.currentRowIndex).toBeNull()
  })
  
  it('删除选中行时应从 selectedRows 移除', () => {
    const view = createTestView()
    view.rows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    view.setSelectedRows([view.rows[0], view.rows[2]])
    
    view.deleteRowById(1)
    
    expect(view.selectedRows).toHaveLength(1)
    expect(view.selectedRows[0].id).toBe(3)
  })
})
```

---

### 1.2 修复批量操作部分失败逻辑

**文件**: `packages/spark-data/src/data-view.ts`

**变更点**:
- [x] `batchDeleteRecords()` - 只删除成功的项
- [x] `batchUpdateRecords()` - 只更新成功的项
- [x] `batchCreateRecords()` - 失败时不添加
- [x] 添加快照机制支持回滚（可选）

**实现示例**:
```typescript
async batchDeleteRecords(ids: Array<string | number>): Promise<CrudResult<BatchResult>> {
  const svc = this.ensureCrudService()
  const result = await svc.batchDelete(ids, this.getCrudConfig())
  
  if (result.success && result.data) {
    // 1. 收集成功的 ID
    const successIds = new Set<string | number>()
    result.data.results.forEach((r, i) => {
      if (r.success) successIds.add(ids[i])
    })
    
    // 2. 只删除成功的项
    let deletedCount = 0
    for (const id of successIds) {
      if (this.deleteRowById(id)) deletedCount++
    }
    
    // 3. 记录部分失败
    if (result.data.failureCount > 0) {
      this.logger.warn(`批量删除部分失败: ${result.data.failureCount}/${ids.length}`, {
        successCount: result.data.successCount,
        errors: result.data.errors
      })
    }
    
    if (deletedCount > 0) {
      this.emitStateChanged('rows')
    }
  }
  
  return result
}
```

---

### 1.3 添加级联加载请求取消机制

**文件**: `packages/spark-data/src/data-view.ts`

**变更点**:
- [x] 添加 `pendingCascadeRequest` 字段
- [x] `respondToParentChange()` 取消旧请求
- [x] `loadFromServer()` 支持请求 ID

**实现**:
```typescript
export class DataView {
  private pendingCascadeRequest?: {
    requestId: number
    cancel: () => void
  }
  private nextRequestId = 0
  
  private respondToParentChange(rel: DataRelation, parentView: DataView, evt: ViewStateEvent): void {
    if (evt.changeType === 'requestState') return
    
    // 1. 取消待处理的级联请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      this.pendingCascadeRequest = undefined
      this.logger.debug(`取消级联请求 ${this.pendingCascadeRequest.requestId}`)
    }
    
    const parentRows = getParentRows(parentView, rel.dependencyType)
    
    if (!parentRows.length) {
      this.resetState()
      this.emitStateChanged('cleared')
      return
    }
    
    if (rel.autoLoad !== false && 
        this.requestState !== RequestState.Preparing && 
        this.requestState !== RequestState.Loading) {
      
      // 2. 创建可取消的请求
      const requestId = ++this.nextRequestId
      let cancelled = false
      
      this.requestState = RequestState.Idle
      this.requestData()
        .then(() => {
          if (!cancelled && this.pendingCascadeRequest?.requestId === requestId) {
            this.pendingCascadeRequest = undefined
          }
        })
        .catch(err => {
          if (!cancelled) {
            this.logger.error(`级联加载失败 [${requestId}]`, err)
          }
        })
      
      this.pendingCascadeRequest = {
        requestId,
        cancel: () => { cancelled = true }
      }
    }
  }
}
```

---

## 🔄 Phase 2: 并发控制（P1，预计 1 天）

### 2.1 添加请求 ID 防止竞态

**文件**: `packages/spark-data/src/data-view.ts`

**变更点**:
- [x] 添加 `currentLoadRequestId` 字段
- [x] `loadFromServer()` 生成并检查请求 ID
- [x] 响应到达时验证请求 ID

**关键代码**:
```typescript
export class DataView {
  private currentLoadRequestId = 0
  
  async loadFromServer(params?: QueryParams): Promise<CrudResult> {
    if (this.requestState === RequestState.Loading) {
      return { success: false, message: 'Already loading' }
    }
    
    this.requestState = RequestState.Loading
    this.loadingError = null
    
    // 生成请求 ID
    const requestId = ++this.currentLoadRequestId
    
    if (!this.crudService) this.initializeCrudService()
    if (!this.crudService) {
      this.requestState = RequestState.Failed
      this.emitStateChanged('requestState')
      throw new Error(`Table ${this.tableName} has no API configuration`)
    }
    
    try {
      const result = await this.crudService.list(params, this.getCrudConfig())
      
      // 检查是否被更新的请求替代
      if (requestId !== this.currentLoadRequestId) {
        this.logger.debug(`请求 ${requestId} 被更新的请求 ${this.currentLoadRequestId} 替代`)
        return { success: false, message: 'Request superseded' }
      }
      
      if (result.success && result.data) {
        this.updateFromServer(result.data)
        this.currentRow = null
        this.currentRowIndex = null
        this.selectedRows.splice(0, this.selectedRows.length)
        this.selectedRowIndices = []
        this.requestState = RequestState.Loaded
        this.emitStateChanged('rows')
      } else {
        this.requestState = RequestState.Failed
        this.emitStateChanged('requestState')
      }
      return result
    } catch (error) {
      // 异常时也要检查请求 ID
      if (requestId !== this.currentLoadRequestId) {
        return { success: false, message: 'Request superseded' }
      }
      
      this.loadingError = error as Error
      this.requestState = RequestState.Failed
      this.emitStateChanged('requestState')
      throw error
    }
  }
}
```

---

### 2.2 批量操作并发控制

**文件**: `packages/spark-data/src/crud-service.ts`

**变更点**:
- [x] `executeBatch()` 改为并发池模式
- [x] 添加 `concurrency` 参数（默认 5）
- [x] 添加进度回调

**实现**:
```typescript
export class CrudService {
  /**
   * 执行批量操作（带并发控制）
   * @param endpoint HTTP端点配置
   * @param items 数据项数组
   * @param config 请求配置
   * @param concurrency 最大并发数
   * @param onProgress 进度回调
   * @returns 批量操作结果数组
   */
  private async executeBatch<T>(
    endpoint: HttpEndpoint,
    items: T[],
    config?: Partial<RequestConfig>,
    concurrency = 5,
    onProgress?: (completed: number, total: number) => void
  ): Promise<CrudResult<T>[]> {
    const results: CrudResult<T>[] = new Array(items.length)
    const pool: Promise<void>[] = []
    let index = 0
    let completed = 0
    
    const executeOne = async (i: number, item: T) => {
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
    
    while (index < items.length || pool.length > 0) {
      // 填充并发池
      while (pool.length < concurrency && index < items.length) {
        const i = index++
        const promise = executeOne(i, items[i])
          .finally(() => {
            const idx = pool.indexOf(promise)
            if (idx !== -1) pool.splice(idx, 1)
          })
        pool.push(promise)
      }
      
      // 等待至少一个请求完成
      if (pool.length > 0) {
        await Promise.race(pool)
      }
    }
    
    return results
  }
}
```

---

## 💾 Phase 3: 内存管理（P1，预计 0.5 天）

### 3.1 添加 DataView.destroy() 方法

**文件**: `packages/spark-data/src/data-view.ts`, `packages/spark-data/src/data-table.ts`

**变更点**:
- [x] `DataView.destroy()` - 清理订阅、数据、引用
- [x] `DataTable.destroyView()` - 销毁指定视图
- [x] `DataTable.destroy()` - 销毁所有视图
- [x] 添加 `isDestroyed()` 状态检查

**实现**:
```typescript
// data-view.ts
export class DataView {
  private _isDestroyed = false
  
  /**
   * 销毁视图，清理所有订阅和引用
   * 应在组件 onUnmounted 时调用
   */
  destroy(): void {
    if (this._isDestroyed) return
    
    this.logger.debug(`销毁 DataView: ${this.tableName}:${this.viewId}`)
    
    // 1. 清理级联订阅
    this.teardownCascade()
    
    // 2. 取消待处理的请求
    if (this.pendingCascadeRequest) {
      this.pendingCascadeRequest.cancel()
      this.pendingCascadeRequest = undefined
    }
    
    // 3. 清理事件监听器（需要 IEventEmitter 支持）
    // this.events.removeAllListeners()
    
    // 4. 清理 CRUD 服务
    this.crudService = undefined
    
    // 5. 清空数据
    this.resetState()
    
    // 6. 清除 TreeManager 引用
    this.treeManager = undefined
    
    // 7. 标记为已销毁
    this._isDestroyed = true
  }
  
  isDestroyed(): boolean {
    return this._isDestroyed
  }
  
  // 所有方法前检查销毁状态
  private checkDestroyed(): void {
    if (this._isDestroyed) {
      throw new Error(`DataView ${this.tableName}:${this.viewId} has been destroyed`)
    }
  }
}

// data-table.ts
export class DataTable {
  /**
   * 销毁指定视图
   */
  destroyView(viewId: string): void {
    const view = this.views[viewId]
    if (view) {
      view.destroy()
      delete this.views[viewId]
    }
  }
  
  /**
   * 销毁所有视图
   */
  destroy(): void {
    for (const [viewId, view] of Object.entries(this.views)) {
      view.destroy()
    }
    this.views = {}
  }
}
```

---

## ⚡ Phase 4: 性能优化（P2，预计 1 天）

### 4.1 优化选中状态查找

**文件**: `packages/spark-data/src/data-view.ts`

**变更点**:
- [x] 添加 `rowIndexMap` 缓存
- [x] `setSelectedRows()` 使用 Map 查找
- [x] `updateFromServer()` 时清除缓存

**实现**:
```typescript
export class DataView {
  private rowIndexMap?: Map<IDataRow, number>
  
  setSelectedRows(rows: IDataRow[]): void {
    const cur = this.selectedRows
    if (cur.length === rows.length && cur.every((r, i) => r === rows[i])) return
    
    this.selectedRows.splice(0, this.selectedRows.length, ...rows)
    
    // 使用 Map 加速索引查找（O(n) 而非 O(n²)）
    if (!this.rowIndexMap) {
      this.rowIndexMap = new Map(this.rows.map((r, i) => [r, i]))
    }
    
    this.selectedRowIndices = rows
      .map(r => this.rowIndexMap!.get(r) ?? -1)
      .filter(i => i !== -1)
    
    this.emitStateChanged('selectedRows', { rows })
  }
  
  updateFromServer(data: { rows?: IDataRow[]; total?: number; page?: number; pageSize?: number } | IDataRow[]): void {
    if (Array.isArray(data)) {
      this.rows.splice(0, this.rows.length, ...data)
    } else {
      if (data.rows) this.rows.splice(0, this.rows.length, ...data.rows)
      if (data.total !== undefined) this.total = data.total
      if (data.page !== undefined) this.page = data.page
      if (data.pageSize !== undefined) this.pageSize = data.pageSize
    }
    
    // 清除索引缓存
    this.rowIndexMap = undefined
  }
}
```

---

### 4.2 防抖 stateChanged 事件

**文件**: `packages/spark-data/src/data-view.ts`

**变更点**:
- [x] 添加 `stateChangedDebouncer` 字段
- [x] `emitStateChanged()` 根据 changeType 决定是否防抖
- [x] 关键状态（`cleared`, `requestState`）立即触发

**实现**:
```typescript
export class DataView {
  private stateChangedDebouncer?: ReturnType<typeof setTimeout>
  
  private emitStateChanged(changeType: ViewStateEvent['changeType'], extra?: Partial<ViewStateEvent>): void {
    const event: ViewStateEvent = {
      tableName: this.tableName,
      viewId: this.viewId,
      changeType,
      ...extra,
    }
    
    // 清除上次的防抖定时器
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
      this.stateChangedDebouncer = undefined
    }
    
    // 关键状态立即触发
    if (changeType === 'cleared' || changeType === 'requestState') {
      this.events.emit('stateChanged', event)
      return
    }
    
    // 其他状态防抖 16ms（约一帧，60fps）
    this.stateChangedDebouncer = setTimeout(() => {
      this.events.emit('stateChanged', event)
      this.stateChangedDebouncer = undefined
    }, 16)
  }
  
  // 销毁时清除防抖定时器
  destroy(): void {
    if (this.stateChangedDebouncer) {
      clearTimeout(this.stateChangedDebouncer)
      this.stateChangedDebouncer = undefined
    }
    // ...
  }
}
```

---

## 📝 Phase 5: 增强功能（P3，预计 1-2 天）

### 5.1 添加数据校验

**新文件**: `packages/spark-data/src/validation.ts`

```typescript
export interface DataSchema {
  columns: DataColumn[]
  validate?: (row: IDataRow) => ValidationError[] | null
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export class DataValidator {
  constructor(private schema: DataSchema) {}
  
  validate(row: IDataRow): ValidationError[] | null {
    if (this.schema.validate) {
      return this.schema.validate(row)
    }
    
    const errors: ValidationError[] = []
    
    for (const col of this.schema.columns) {
      const value = row[col.name]
      
      // 必填校验
      if (!col.allowDBNull && (value === null || value === undefined)) {
        errors.push({
          field: col.name,
          message: `${col.label ?? col.name} 不能为空`,
          code: 'REQUIRED'
        })
      }
      
      // 类型校验
      if (value !== null && value !== undefined) {
        const actualType = typeof value
        if (col.type === 'number' && actualType !== 'number') {
          errors.push({
            field: col.name,
            message: `${col.label ?? col.name} 必须是数字`,
            code: 'INVALID_TYPE'
          })
        }
        // ... 其他类型校验
      }
    }
    
    return errors.length > 0 ? errors : null
  }
}
```

---

### 5.2 添加可观测性（Metrics）

**新文件**: `packages/spark-data/src/metrics.ts`

```typescript
export interface RequestMetrics {
  requestId: string
  operation: string
  tableName: string
  viewId: string
  startTime: number
  endTime?: number
  duration?: number
  status: 'pending' | 'success' | 'error'
  error?: Error
  params?: unknown
}

export class MetricsCollector {
  private metrics: RequestMetrics[] = []
  private maxMetrics = 100
  
  startRequest(operation: string, tableName: string, viewId: string, params?: unknown): RequestMetrics {
    const metric: RequestMetrics = {
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      operation,
      tableName,
      viewId,
      startTime: Date.now(),
      status: 'pending',
      params
    }
    
    this.metrics.push(metric)
    this.cleanup()
    
    return metric
  }
  
  endRequest(metric: RequestMetrics, status: 'success' | 'error', error?: Error): void {
    metric.endTime = Date.now()
    metric.duration = metric.endTime - metric.startTime
    metric.status = status
    if (error) metric.error = error
  }
  
  getMetrics(): RequestMetrics[] {
    return [...this.metrics]
  }
  
  getStats(): {
    totalRequests: number
    successRate: number
    avgDuration: number
    errorCount: number
  } {
    const total = this.metrics.length
    const success = this.metrics.filter(m => m.status === 'success').length
    const errors = this.metrics.filter(m => m.status === 'error').length
    const avgDuration = this.metrics
      .filter(m => m.duration !== undefined)
      .reduce((sum, m) => sum + m.duration!, 0) / total
    
    return {
      totalRequests: total,
      successRate: total > 0 ? success / total : 0,
      avgDuration: avgDuration || 0,
      errorCount: errors
    }
  }
  
  private cleanup(): void {
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.splice(0, this.metrics.length - this.maxMetrics)
    }
  }
}
```

---

## 🧪 测试策略

### 单元测试覆盖目标

| 模块 | 覆盖率目标 | 关键测试用例 |
|------|-----------|-------------|
| DataView | 90%+ | 选中状态清理、批量操作、级联加载 |
| DataTable | 85%+ | 视图管理、引用链、销毁 |
| DataSet | 85%+ | 关系查询、序列化 |
| CrudService | 90%+ | 并发控制、错误处理、权限传递 |

### 集成测试场景

1. **级联加载场景**: 父视图变化 → 子视图自动加载
2. **并发请求场景**: 快速切换 currentRow → 只显示最后一次请求结果
3. **批量操作场景**: 部分成功部分失败 → 本地状态正确同步
4. **内存泄漏场景**: 创建/销毁视图 → 内存不增长

---

## 📊 验收标准

### Phase 1（数据一致性）
- [ ] 所有选中状态测试通过（20+ 测试用例）
- [ ] 批量操作部分失败测试通过（10+ 测试用例）
- [ ] 级联加载竞态测试通过（5+ 测试用例）

### Phase 2（并发控制）
- [ ] 请求去重测试通过（5+ 测试用例）
- [ ] 批量操作并发测试通过（3+ 测试用例）
- [ ] 性能提升 50% 以上（批量 100 条数据）

### Phase 3（内存管理）
- [ ] 销毁方法测试通过（10+ 测试用例）
- [ ] 内存泄漏检测通过（Chrome DevTools）
- [ ] 无未清理的订阅（事件监听器数量不增长）

### Phase 4（性能优化）
- [ ] 选中状态查找性能提升 10x+（1000 行数据）
- [ ] 防抖机制生效（100 次状态变化 → 最多 7 次 UI 更新）

### Phase 5（增强功能）
- [ ] 数据校验覆盖所有 CRUD 操作
- [ ] Metrics 收集正常工作
- [ ] 性能统计准确（误差 < 5%）

---

## 🚀 执行时间表

| Phase | 开始日期 | 结束日期 | 负责人 | 状态 |
|-------|---------|---------|--------|------|
| Phase 1 | 2026-02-20 | 2026-02-21 | - | ⏸️ 待开始 |
| Phase 2 | 2026-02-22 | 2026-02-22 | - | ⏸️ 待开始 |
| Phase 3 | 2026-02-23 | 2026-02-23 | - | ⏸️ 待开始 |
| Phase 4 | 2026-02-24 | 2026-02-24 | - | ⏸️ 待开始 |
| Phase 5 | 2026-02-25 | 2026-02-26 | - | ⏸️ 待开始 |
| **总计** | **2026-02-20** | **2026-02-26** | - | ⏸️ 待开始 |

---

**创建日期**: 2026年2月19日  
**最后更新**: 2026年2月19日  
**文档状态**: 📝 草稿
