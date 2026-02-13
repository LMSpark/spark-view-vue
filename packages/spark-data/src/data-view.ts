/**
 * DataView 类 - 数据视图
 * 负责：选中状态管理、数据视图、通知机制、加载状态管理
 * 相当于 .NET 的 DataView - 视图层
 * 
 * 核心概念：
 * - 视图是 UI 和后端的桥梁
 * - 视图管理加载状态（loading/error/ready）
 * - UI 监听视图状态变化进行渲染
 * - 非阻塞设计：UI 请求 → 视图标记loading → 异步加载 → 通知UI
 */

import type { IDataRow, IDataRowWithPermission, IDataView, IViewMetadata, IDataSet, FilterExpression, SortExpression, ITreeManager } from './types'
import { Logger, DATA_SOURCE, SELECTION } from '@spark-view/spark-utils'
import type { Provider as CapabilityProvider, CapabilityKey } from '@spark-view/spark-utils'

/**
 * 视图状态历史记录
 */
export interface ViewStateHistoryEntry {
  timestamp: number                              // 时间戳
  state: 'loading' | 'ready' | 'error' | 'cancelled'  // 状态
  rowCount?: number                              // 数据行数
  error?: string                                 // 错误信息
  duration?: number                              // 操作耗时（毫秒）
  retryCount?: number                            // 重试次数
}

/**
 * 数据视图类（实现 IDataView 接口 + 方法逻辑）
 */
export class DataView implements IDataView {
  currentRow: IDataRowWithPermission | null = null
  currentRowIndex: number | null = null  // 当前行索引
  selectedRows: IDataRowWithPermission[] = []
  selectedRowIndices: number[] = []      // 选中行索引数组
  rows: IDataRowWithPermission[] = []
  private __originalRows?: IDataRowWithPermission[]
  
  // 宿主信息
  private __hostTable: string
  private __contextId: string
  
  protected logger = Logger('DataView')
  
  // 初始配置
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean  // 自动选中第一行
  autoDeselectOnEmpty?: boolean  // 数据清空时自动取消选中
  
  // ==================== 视图状态（非阻塞设计的核心）====================
  
  // 基础加载状态
  isLoading: boolean = false         // 数据加载中
  loadingError: Error | null = null  // 加载错误
  lastLoadTime: number | null = null // 上次加载时间戳（成功加载）
  
  // 取消机制
  private abortController: AbortController | null = null  // 用于取消加载
  
  // 重试逻辑
  retryCount: number = 0             // 当前重试次数
  maxRetries: number = 3             // 最大重试次数
  retryDelay: number = 1000          // 重试延迟（毫秒）
  lastRetryTime: number | null = null // 上次重试时间戳
  
  // 性能指标
  loadStartTime: number | null = null    // 加载开始时间
  loadDuration: number | null = null     // 加载耗时（毫秒）
  totalLoadCount: number = 0             // 总加载次数
  
  // 状态历史（调试用）
  private stateHistory: ViewStateHistoryEntry[] = []
  maxHistorySize: number = 20        // 最大历史记录数
  
  // 生命周期钩子
  onBeforeLoad?: (context: DataView) => void | Promise<void>
  onAfterLoad?: (context: DataView, success: boolean) => void | Promise<void>
  onLoadError?: (context: DataView, error: Error) => void | Promise<void>
  onLoadCancel?: (context: DataView) => void | Promise<void>
  
  // 分页状态（运行时必需）
  total: number = 0           // 总记录数
  page: number = 1            // 当前页码（1-based）
  pageSize: number = 20       // 每页大小
  
  // @deprecated 使用独立的 total/page/pageSize 字段
  pagination?: {
    pageIndex?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
  
  // DataSet 引用（用于触发通知）
  protected dataSet?: IDataSet
  
  // TreeManager 引用（用于树形数据管理）
  treeManager?: ITreeManager
  
  // DataTable 引用（用于主动请求数据）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dataTable?: any // IDataTable 会造成循环依赖，使用 any

  constructor(
    hostTable: string,
    contextId: string = 'default',
    dataSet?: IDataSet
  ) {
    this.__hostTable = hostTable
    this.__contextId = contextId
    this.dataSet = dataSet
  }
  
  // ==================== 公共访问器 ====================
  
  /** 获取宿主表名 */
  get hostTable(): string { return this.__hostTable }
  
  /** 获取上下文 ID */
  get contextId(): string { return this.__contextId }
  
  /** 获取原始数据行（过滤/排序前的完整数据） */
  get originalRows(): IDataRowWithPermission[] | undefined { return this.__originalRows }
  
  /** 设置原始数据行 */
  set originalRows(value: IDataRowWithPermission[] | undefined) { this.__originalRows = value }
  
  /**
   * 设置 DataSet 引用
   */
  setDataSet(dataSet: IDataSet): void {
    this.dataSet = dataSet
  }
  
  /**
   * 设置 TreeManager 引用
   */
  setTreeManager(treeManager: ITreeManager): void {
    this.treeManager = treeManager
    // 双向绑定
    if (treeManager && typeof treeManager.setDataView === 'function') {
      treeManager.setDataView(this)
    }
  }
  
  /**
   * 获取 TreeManager 引用
   */
  getTreeManager(): ITreeManager | undefined {
    return this.treeManager
  }
  
  /**
   * 设置 DataTable 引用
   * 使视图能够主动向表层请求数据
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDataTable(dataTable: any): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.dataTable = dataTable
  }
  
  /**
   * 获取 DataTable 引用
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDataTable(): any | undefined {
    return this.dataTable
  }
  
  // ==================== 能力注册 ====================
  
  /**
   * 获取视图层能力列表
   * 
   * 视图层提供的能力：
   * - DATA_SOURCE: 数据源（rows 访问、刷新）
   * - SELECTION: 选择状态（currentRow、selectedRows）
   * 
   * @returns 能力 Map（CapabilityKey → Provider）
   */
  getCapabilities(): Map<CapabilityKey<unknown>, CapabilityProvider> {
    const capabilities = new Map<CapabilityKey<unknown>, CapabilityProvider>()
    
    // 1. 数据源能力
    capabilities.set(DATA_SOURCE as CapabilityKey<unknown>, {
      name: DATA_SOURCE,
      implementation: {
        getData: () => this.rows,
        refresh: () => this.reload()
      }
    })
    
    // 2. 选择能力
    capabilities.set(SELECTION as CapabilityKey<unknown>, {
      name: SELECTION,
      implementation: {
        select: (id: number | string) => {
          const row = this.rows.find(r => r.id === id)
          if (row) this.setCurrentRow(row)
        },
        deselect: (_id: number | string) => {
          this.setCurrentRow(null)
        },
        isSelected: (id: number | string) => {
          return this.currentRow?.id === id || this.selectedRows.some(r => r.id === id)
        },
        clearSelection: () => {
          this.setCurrentRow(null)
          this.setSelectedRows([])
        },
        getSelected: () => {
          return this.selectedRows.map(r => r.id as string | number).filter(Boolean)
        }
      }
    })
    
    return capabilities
  }
  
  // ==================== 主动请求能力 ====================
  
  /**
   * 加载数据
   * 向表层请求加载数据，携带当前视图的请求参数（page, pageSize, filter, sort）
   * 
   * @returns Promise<void>
   * 
   * @example
   * ```typescript
   * // UI 触发加载
   * await view.load()
   * 
   * // 内部流程：
   * // 1. 视图标记 isLoading = true
   * // 2. 调用 dataTable.load(this, params)
   * // 3. 表层执行网络请求
   * // 4. 表层填充 view.rows
   * // 5. 视图标记 isLoading = false
   * ```
   */
  async load(): Promise<void> {
    if (!this.dataTable) {
      this.logger.warn(`⚠️ [DataView] ${this.hostTable}.${this.contextId} 未设置 DataTable 引用，无法加载数据`)
      return
    }
    
    // 执行生命周期钩子
    if (this.onBeforeLoad) {
      await this.onBeforeLoad(this)
    }
    
    // 标记加载状态
    this.isLoading = true
    this.loadStartTime = Date.now()
    this.totalLoadCount++
    
    try {
      // 准备请求参数（从视图中获取）
      const params: {
        page: number
        pageSize: number
        filter?: FilterExpression
        sort?: SortExpression
      } = {
        page: this.page,
        pageSize: this.pageSize,
        filter: this.filterExpression,
        sort: this.sortExpression
      }
      
      this.logger.info(`📡 [DataView] ${this.hostTable}.${this.contextId} 开始加载数据`, params)
      
      // 委托给 DataTable 执行请求
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof this.dataTable?.loadForView === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await this.dataTable.loadForView(this, params)
      } else {
        throw new Error(`DataTable 未实现 loadForView 方法`)
      }
      
      // 记录成功
      this.lastLoadTime = Date.now()
      this.loadDuration = this.lastLoadTime - (this.loadStartTime || 0)
      this.loadingError = null
      this.retryCount = 0
      
      this.logger.info(`✅ [DataView] ${this.hostTable}.${this.contextId} 加载完成，耗时 ${this.loadDuration}ms，${this.rows.length} 行`)
      
      // 记录状态历史
      this.addStateHistory({
        timestamp: this.lastLoadTime,
        state: 'ready',
        rowCount: this.rows.length,
        duration: this.loadDuration
      })
      
      // 执行成功钩子
      if (this.onAfterLoad) {
        await this.onAfterLoad(this, true)
      }
      
    } catch (error) {
      // 记录错误
      this.loadingError = error as Error
      this.loadDuration = Date.now() - (this.loadStartTime || 0)
      
      this.logger.error(`❌ [DataView] ${this.hostTable}.${this.contextId} 加载失败`, error)
      
      // 记录状态历史
      this.addStateHistory({
        timestamp: Date.now(),
        state: 'error',
        error: (error as Error).message,
        duration: this.loadDuration
      })
      
      // 执行错误钩子
      if (this.onLoadError) {
        await this.onLoadError(this, error as Error)
      }
      
      // 执行失败钩子
      if (this.onAfterLoad) {
        await this.onAfterLoad(this, false)
      }
      
      throw error
      
    } finally {
      // 清除加载状态
      this.isLoading = false
      this.loadStartTime = null
    }
  }
  
  /**
   * 保存数据变更
   * 向表层请求保存单行或多行数据
   * 
   * @param row 要保存的行数据（可选，如果不提供则保存当前选中行）
   * @returns Promise<void>
   * 
   * @example
   * ```typescript
   * // 保存指定行
   * await view.save(modifiedRow)
   * 
   * // 保存当前行
   * await view.save()
   * ```
   */
  async save(row?: IDataRowWithPermission): Promise<void> {
    if (!this.dataTable) {
      this.logger.warn(`⚠️ [DataView] ${this.hostTable}.${this.contextId} 未设置 DataTable 引用，无法保存数据`)
      return
    }
    
    // 确定要保存的行
    const rowToSave = row ?? this.currentRow
    if (!rowToSave) {
      this.logger.warn(`⚠️ [DataView] ${this.hostTable}.${this.contextId} 没有要保存的数据`)
      return
    }
    
    this.logger.info(`💾 [DataView] ${this.hostTable}.${this.contextId} 开始保存数据`)
    
    try {
      // 委托给 DataTable 执行请求
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof this.dataTable?.saveRow === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await this.dataTable.saveRow(rowToSave)
      } else {
        throw new Error(`DataTable 未实现 saveRow 方法`)
      }
      
      this.logger.info(`✅ [DataView] ${this.hostTable}.${this.contextId} 保存成功`)
      
    } catch (error) {
      this.logger.error(`❌ [DataView] ${this.hostTable}.${this.contextId} 保存失败`, error)
      throw error
    }
  }
  
  /**
   * 刷新数据
   * 使用当前参数重新加载数据
   * 
   * @returns Promise<void>
   * 
   * @example
   * ```typescript
   * // 刷新当前数据
   * await view.refresh()
   * ```
   */
  async reload(): Promise<void> {
    this.logger.info(`🔄 [DataView] ${this.hostTable}.${this.contextId} 刷新数据`)
    return this.load()
  }

  /**
   * 设置当前选中行
   * 
   * @param row - 要选中的行数据，传入 null 则取消选中
   * @param skipNotify - 是否跳过当前表的 UI 更新通知（默认 false）
   *   - `true`: 不更新当前表格 UI，但仍会触发关联表更新
   *   - `false`: 触发完整的更新流程（关联表 + 订阅者 + 事件）
   * 
   * @remarks
   * - 自动防重：如果新行与现有行相同（引用比较），则跳过更新
   * - 级联更新：会自动触发依赖此上下文的子表过滤
   * - 事件触发：会触发 `currentRowChanged` 事件（除非 skipNotify=true）
   * 
   * @example
   * ```typescript
   * // 选中第一行并触发级联
   * context.setCurrentRow(rows[0])
   * 
   * // 取消选中
   * context.setCurrentRow(null)
   * 
   * // 内部同步（不触发 UI 更新）
   * context.setCurrentRow(row, true)
   * ```
   * 
   * @fires DataSet#currentRowChanged - 当 skipNotify=false 时触发
   */
  setCurrentRow(row: IDataRowWithPermission | null, skipNotify: boolean = false): void {
    // 防重复检查 - 只比较引用
    const existingRow = this.currentRow
    const isSameRow = existingRow === row
    
    if (isSameRow) {
      console.info(`⏭️ [Context] ${this.hostTable}.${this.contextId}.currentRow 未变化`)
      return
    }
    
    console.info(`🔄 [Context] ${this.hostTable}.${this.contextId}.currentRow 更新`, { from: existingRow, to: row })
    this.currentRow = row
    
    // 同步维护索引
    this.currentRowIndex = row === null ? null : this.rows.indexOf(row)
    if (this.currentRowIndex === -1) {
      this.currentRowIndex = null  // 如果行不在 rows 中，设为 null
    }
    
    if (!skipNotify && this.dataSet) {
      // 触发关系更新
      this.dataSet.updateRelatedTables(this.hostTable, this.contextId)
      
      // 通知订阅者
      this.dataSet.notifySubscribers(this.hostTable, this.contextId)
      
      // 触发事件
      this.dataSet.emit('currentRowChanged', { 
        tableName: this.hostTable, 
        contextId: this.contextId, 
        row 
      })
    }
  }

  /**
   * 设置选中行集合
   * 
   * @param rows - 选中的行数据数组
   * @param skipNotify - 是否跳过当前表的 UI 更新通知（默认 false）
   *   - `true`: 不通知当前表的订阅者，但仍会触发关联表更新
   *   - `false`: 触发完整的更新流程
   * 
   * @remarks
   * - 自动防重：比较数组长度和元素引用，相同则跳过
   * - 级联更新：始终触发 updateRelatedTables（过滤依赖此上下文的子表）
   * - 订阅通知：根据 skipNotify 决定是否通知当前表的订阅者
   * - 事件触发：仅在 skipNotify=false 时触发，避免 UI→数据→UI 循环
   * 
   * @example
   * ```typescript
   * // 选中多行
   * context.setSelectedRows([row1, row2, row3])
   * 
   * // 清空选中
   * context.setSelectedRows([])
   * 
   * // 内部同步（避免循环通知）
   * context.setSelectedRows(rows, true)
   * ```
   * 
   * @fires DataSet#selectedRowsChanged - 当 skipNotify=false 时触发
   */
  setSelectedRows(rows: IDataRowWithPermission[], skipNotify: boolean = false): void {
    // 防重复检查：只比较引用
    const existingRows = this.selectedRows || []
    const isSameSelection = (
      existingRows.length === rows.length &&
      existingRows.every((existingRow, index) => existingRow === rows[index])
    )
    
    if (isSameSelection) {
      console.info(`⏭️ [Context] ${this.hostTable}.${this.contextId}.selectedRows 未变化`)
      return
    }
    
    console.info(`🔄 [Context] ${this.hostTable}.${this.contextId}.selectedRows 更新`, { 
      from: existingRows.length, 
      to: rows.length 
    })
    this.selectedRows = rows
    
    // 同步维护索引数组
    this.selectedRowIndices = rows
      .map(row => this.rows.indexOf(row))
      .filter(index => index !== -1)  // 过滤掉不在 rows 中的行
    
    if (this.dataSet) {
      // ✅ 始终触发关系更新（过滤子表）
      this.dataSet.updateRelatedTables(this.hostTable, this.contextId)
      
      // ❓ 根据 skipNotify 决定是否通知当前表的订阅者
      if (!skipNotify) {
        this.dataSet.notifySubscribers(this.hostTable, this.contextId)
        
        // 🔔 仅在非 skipNotify 时触发事件（避免 UI→数据→UI 循环）
        this.dataSet.emit('selectedRowsChanged', { 
          tableName: this.hostTable, 
          contextId: this.contextId, 
          rows 
        })
      }
    }
  }

  /**
   * 手动触发通知
   * 
   * @remarks
   * 用于手动触发订阅者更新，通常在以下场景使用：
   * - 批量修改数据后一次性通知
   * - 手动刷新 UI
   * - 强制重新计算依赖关系
   * 
   * @example
   * ```typescript
   * // 批量修改后通知
   * context.rows.push(newRow1, newRow2, newRow3)
   * context.notifyChange()  // 一次性通知所有订阅者
   * ```
   */
  notifyChange(): void {
    if (this.dataSet) {
      this.dataSet.notifySubscribers(this.hostTable, this.contextId)
    }
  }

  /**
   * 清空所有状态（用于条件不满足时递归清空）
   * 
   * @param skipNotify - 是否跳过通知（默认 false）
   * 
   * @remarks
   * - 清空 rows, currentRow, selectedRows
   * - **不**清空 _originalRows（保留缓存数据）
   * - 使用 splice 保持 Vue 响应式引用
   * - 仅在数据发生变化时触发通知
   * 
   * @example
   * ```typescript
   * // 主表选中为空，清空子表
   * if (!parentContext.currentRow) {
   *   childContext.clearAll()
   * }
   * ```
   * 
   * @fires DataSet#contextCleared - 当数据发生变化且 skipNotify=false 时触发
   */
  clearAll(skipNotify: boolean = false): void {
    const hadData = this.rows.length > 0 || this.currentRow !== null || this.selectedRows.length > 0;
    
    // ✅ 使用 splice 保持 Vue 响应式引用
    this.rows.splice(0, this.rows.length);
    this.currentRow = null;
    this.selectedRows.splice(0, this.selectedRows.length);
    // 注意：不清空 _originalRows，保留缓存数据
    
    if (hadData) {
      console.info(`🧹 [Context] ${this.hostTable}.${this.contextId} 已清空所有状态`);
    }
    
    if (!skipNotify && hadData && this.dataSet) {
      this.dataSet.notifySubscribers(this.hostTable, this.contextId);
      // 触发清空事件
      this.dataSet.emit('contextCleared', { tableName: this.hostTable, contextId: this.contextId });
    }
  }

  // ==================== 视图状态管理（非阻塞设计） ====================

  /**
   * 设置视图为加载中状态（增强版）
   * 
   * 使用场景：
   * - UI 请求数据时立即调用
   * - 视图标记为"请求中"，UI 显示 loading 状态
   * - 非阻塞设计的关键：UI 不等待数据返回
   * 
   * 增强特性：
   * - 创建 AbortController（支持取消）
   * - 记录加载开始时间（性能监控）
   * - 调用 onBeforeLoad 钩子
   * - 记录状态历史
   * 
   * @example
   * ```typescript
   * // UI 点击加载按钮
   * context.setLoading()  // 立即标记loading
   * dataSet.requestTableData('Users')  // 异步加载
   * ```
   */
  async setLoading(): Promise<void> {
    // 如果已经在加载中，先取消之前的加载
    if (this.isLoading && this.abortController) {
      this.logger.info(`⏭️ [视图状态] ${this.hostTable}.${this.contextId} 取消上一个加载请求`);
      this.abortController.abort();
    }
    
    this.isLoading = true;
    this.loadingError = null;
    this.loadStartTime = Date.now();
    this.totalLoadCount++;
    
    // 创建新的 AbortController
    this.abortController = new AbortController();
    
    this.logger.info(`⏳ [视图状态] ${this.hostTable}.${this.contextId} → loading (第 ${this.totalLoadCount} 次)`);
    
    // 记录状态历史
    this.addStateHistory({
      timestamp: Date.now(),
      state: 'loading',
      retryCount: this.retryCount
    });
    
    // 调用生命周期钩子
    if (this.onBeforeLoad) {
      try {
        await this.onBeforeLoad(this);
      } catch (error) {
        this.logger.error(`❌ [钩子错误] onBeforeLoad:`, error);
      }
    }
    
    // 通知 UI 更新状态
    if (this.dataSet) {
      this.dataSet.emit('viewStateChanged', {
        tableName: this.hostTable,
        contextId: this.contextId,
        state: 'loading',
        retryCount: this.retryCount,
        totalLoadCount: this.totalLoadCount
      });
    }
  }

  /**
   * 设置视图为就绪状态（数据加载成功）
   * 
   * 使用场景：
   * - 数据加载成功后调用
   * - 视图标记为"就绪"，UI 显示数据
   * 
   * 增强特性：
   * - 计算加载耗时
   * - 重置重试计数
   * - 调用 onAfterLoad 钩子
   * - 记录状态历史
   * 
   * @example
   * ```typescript
   * // DataLoader 加载成功
   * context.setReady()
   * context.rows = loadedData  // 更新数据
   * ```
   */
  async setReady(): Promise<void> {
    if (this.isLoading || this.loadingError) {
      this.isLoading = false;
      this.loadingError = null;
      this.lastLoadTime = Date.now();
      
      // 计算加载耗时
      if (this.loadStartTime) {
        this.loadDuration = Date.now() - this.loadStartTime;
      }
      
      // 重置重试计数
      this.retryCount = 0;
      this.lastRetryTime = null;
      
      // 清除 AbortController
      this.abortController = null;
      
      this.logger.info(
        `✅ [视图状态] ${this.hostTable}.${this.contextId} → ready ` +
        `(${this.rows.length} rows, ${this.loadDuration}ms)`
      );
      
      // 记录状态历史
      this.addStateHistory({
        timestamp: Date.now(),
        state: 'ready',
        rowCount: this.rows.length,
        duration: this.loadDuration ?? undefined
      });
      
      // 调用生命周期钩子
      if (this.onAfterLoad) {
        try {
          await this.onAfterLoad(this, true);
        } catch (error) {
          this.logger.error(`❌ [钩子错误] onAfterLoad:`, error);
        }
      }
      
      // 通知 UI 更新状态
      if (this.dataSet) {
        this.dataSet.emit('viewStateChanged', {
          tableName: this.hostTable,
          contextId: this.contextId,
          state: 'ready',
          rowCount: this.rows.length,
          duration: this.loadDuration,
          totalLoadCount: this.totalLoadCount
        });
      }
    }
  }

  /**
   * 设置视图为错误状态（数据加载失败）
   * 
   * 使用场景：
   * - 数据加载失败后调用
   * - 视图标记为"错误"，UI 显示错误信息
   * 
   * 增强特性：
   * - 自动重试逻辑（如果未超过 maxRetries）
   * - 调用 onLoadError 钩子
   * - 记录状态历史
   * 
   * @param error - 错误对象
   * @param autoRetry - 是否自动重试（默认 true）
   * 
   * @example
   * ```typescript
   * // DataLoader 加载失败
   * try {
   *   await loadData()
   * } catch (error) {
   *   context.setError(error)
   * }
   * ```
   */
  async setError(error: Error, autoRetry: boolean = true): Promise<void> {
    this.isLoading = false;
    this.loadingError = error;
    
    // 计算加载耗时（失败也记录）
    if (this.loadStartTime) {
      this.loadDuration = Date.now() - this.loadStartTime;
    }
    
    // 清除 AbortController
    this.abortController = null;
    
    this.logger.error(
      `❌ [视图状态] ${this.hostTable}.${this.contextId} → error ` +
      `(重试 ${this.retryCount}/${this.maxRetries}): ${error.message}`
    );
    
    // 记录状态历史
    this.addStateHistory({
      timestamp: Date.now(),
      state: 'error',
      error: error.message,
      duration: this.loadDuration ?? undefined,
      retryCount: this.retryCount
    });
    
    // 调用生命周期钩子
    if (this.onLoadError) {
      try {
        await this.onLoadError(this, error);
      } catch (hookError) {
        this.logger.error(`❌ [钩子错误] onLoadError:`, hookError);
      }
    }
    
    // 调用 onAfterLoad 钩子（失败情况）
    if (this.onAfterLoad) {
      try {
        await this.onAfterLoad(this, false);
      } catch (hookError) {
        this.logger.error(`❌ [钩子错误] onAfterLoad:`, hookError);
      }
    }
    
    // 判断是否需要自动重试
    if (autoRetry && this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.lastRetryTime = Date.now();
      
      this.logger.info(
        `🔄 [自动重试] ${this.hostTable}.${this.contextId} 将在 ${this.retryDelay}ms 后重试 ` +
        `(${this.retryCount}/${this.maxRetries})`
      );
      
      // 延迟重试（指数退避）
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
      setTimeout(() => {
        if (this.dataSet) {
          this.logger.info(`♻️ [重试] ${this.hostTable}.${this.contextId} 开始第 ${this.retryCount} 次重试`);
          this.dataSet.requestTableData(this.hostTable);
        }
      }, delay);
    } else {
      // 重试次数已用尽或不自动重试
      if (this.retryCount >= this.maxRetries) {
        this.logger.error(
          `🚫 [重试失败] ${this.hostTable}.${this.contextId} 已达到最大重试次数 (${this.maxRetries})`
        );
      }
    }
    
    // 通知 UI 更新状态
    if (this.dataSet) {
      this.dataSet.emit('viewStateChanged', {
        tableName: this.hostTable,
        contextId: this.contextId,
        state: 'error',
        error: error.message,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
        willRetry: autoRetry && this.retryCount < this.maxRetries
      });
    }
  }

  /**
   * 取消正在进行的数据加载
   * 
   * 使用场景：
   * - 用户手动取消加载
   * - 组件卸载时取消加载
   * - 切换视图时取消之前的加载
   * 
   * @example
   * ```typescript
   * // 用户点击取消按钮
   * context.cancelLoad()
   * ```
   */
  async cancelLoad(): Promise<void> {
    if (this.isLoading && this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.isLoading = false;
      
      this.logger.info(`🛑 [取消加载] ${this.hostTable}.${this.contextId}`);
      
      // 记录状态历史
      this.addStateHistory({
        timestamp: Date.now(),
        state: 'cancelled'
      });
      
      // 调用生命周期钩子
      if (this.onLoadCancel) {
        try {
          await this.onLoadCancel(this);
        } catch (error) {
          this.logger.error(`❌ [钩子错误] onLoadCancel:`, error);
        }
      }
      
      // 通知 UI 更新状态
      if (this.dataSet) {
        this.dataSet.emit('viewStateChanged', {
          tableName: this.hostTable,
          contextId: this.contextId,
          state: 'cancelled'
        });
      }
    }
  }

  /**
   * 手动重试加载
   * 
   * 使用场景：
   * - 加载失败后用户点击"重试"按钮
   * - 自动重试失败后手动触发
   * 
   * @param resetRetryCount - 是否重置重试计数（默认 false）
   * 
   * @example
   * ```typescript
   * // 用户点击重试按钮
   * context.retryLoad(true)  // 重置重试计数
   * ```
   */
  retryLoad(resetRetryCount: boolean = false): void {
    if (resetRetryCount) {
      this.retryCount = 0;
      this.lastRetryTime = null;
    }
    
    this.logger.info(`♻️ [手动重试] ${this.hostTable}.${this.contextId}`);
    
    if (this.dataSet) {
      this.dataSet.requestTableData(this.hostTable);
    }
  }

  /**
   * 获取视图当前状态
   * 
   * @returns 'loading' | 'ready' | 'error' | 'empty'
   */
  getState(): 'loading' | 'ready' | 'error' | 'empty' {
    if (this.isLoading) return 'loading';
    if (this.loadingError) return 'error';
    if (this.rows.length === 0) return 'empty';
    return 'ready';
  }

  /**
   * 添加状态历史记录
   * 
   * @param entry - 状态历史条目
   */
  private addStateHistory(entry: ViewStateHistoryEntry): void {
    this.stateHistory.push(entry);
    
    // 限制历史记录大小
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * 获取状态历史记录
   * 
   * @param limit - 返回最近 N 条记录（默认返回全部）
   * @returns 状态历史数组
   * 
   * @example
   * ```typescript
   * // 获取最近 5 条状态变化
   * const recentStates = context.getStateHistory(5)
   * console.table(recentStates)
   * ```
   */
  getStateHistory(limit?: number): ViewStateHistoryEntry[] {
    if (limit) {
      return this.stateHistory.slice(-limit);
    }
    return [...this.stateHistory];
  }

  /**
   * 清空状态历史记录
   */
  clearStateHistory(): void {
    this.stateHistory = [];
    this.logger.info(`🧹 [清空历史] ${this.hostTable}.${this.contextId} 状态历史已清空`);
  }

  /**
   * 获取性能统计信息
   * 
   * @returns 性能统计对象
   * 
   * @example
   * ```typescript
   * const stats = context.getPerformanceStats()
   * console.log(`平均加载时间: ${stats.avgLoadDuration}ms`)
   * console.log(`成功率: ${stats.successRate}%`)
   * ```
   */
  getPerformanceStats() {
    const successCount = this.stateHistory.filter(h => h.state === 'ready').length;
    const errorCount = this.stateHistory.filter(h => h.state === 'error').length;
    const cancelCount = this.stateHistory.filter(h => h.state === 'cancelled').length;
    const totalAttempts = successCount + errorCount + cancelCount;
    
    const durations = this.stateHistory
      .filter(h => h.duration !== undefined)
      .map(h => h.duration as number);
    
    const avgLoadDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;
    
    return {
      totalLoadCount: this.totalLoadCount,
      successCount,
      errorCount,
      cancelCount,
      totalAttempts,
      successRate: totalAttempts > 0 ? (successCount / totalAttempts) * 100 : 0,
      avgLoadDuration: Math.round(avgLoadDuration),
      lastLoadTime: this.lastLoadTime,
      lastLoadDuration: this.loadDuration,
      currentRetryCount: this.retryCount,
      maxRetries: this.maxRetries
    };
  }

  /**
   * 应用排序表达式
   */
  private applySorting(rows: IDataRow[], sortExpression: SortExpression): IDataRow[] {
    // 创建副本以避免修改原数组
    const sorted = [...rows];
    
    // 判断是单字段还是多字段排序
    if ('field' in sortExpression) {
      // 单字段排序
      const { field, direction } = sortExpression;
      return this.sortByField(sorted, field, direction);
    } else if ('fields' in sortExpression) {
      // 多字段排序
      return this.sortByFields(sorted, sortExpression.fields);
    }
    
    return sorted;
  }

  /**
   * 单字段排序
   */
  private sortByField(rows: IDataRow[], field: string, direction: string): IDataRow[] {
    const isAsc = direction.toLowerCase() === 'asc';
    
    return rows.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      
      // 处理 null/undefined
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return isAsc ? 1 : -1;
      if (bVal === null) return isAsc ? -1 : 1;
      
      // 数值比较
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return isAsc ? aVal - bVal : bVal - aVal;
      }
      
      // 字符串比较
      const aStr = String(aVal);
      const bStr = String(bVal);
      const compareResult = aStr.localeCompare(bStr, 'zh-CN');
      
      return isAsc ? compareResult : -compareResult;
    });
  }

  /**
   * 多字段排序
   */
  private sortByFields(rows: IDataRow[], fields: Array<{ field: string; direction: string }>): IDataRow[] {
    return rows.sort((a, b) => {
      for (const { field, direction } of fields) {
        const isAsc = direction.toLowerCase() === 'asc';
        const aVal = a[field];
        const bVal = b[field];
        
        // 处理 null/undefined
        if (aVal === null && bVal === null) continue;
        if (aVal === null) return isAsc ? 1 : -1;
        if (bVal === null) return isAsc ? -1 : 1;
        
        // 数值比较
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          const diff = aVal - bVal;
          if (diff !== 0) return isAsc ? diff : -diff;
          continue;
        }
        
        // 字符串比较
        const aStr = String(aVal);
        const bStr = String(bVal);
        const compareResult = aStr.localeCompare(bStr, 'zh-CN');
        
        if (compareResult !== 0) {
          return isAsc ? compareResult : -compareResult;
        }
      }
      
      return 0; // 所有字段都相等
    });
  }

  /**
   * 更新上下文的 rows（应用过滤和排序）
   * 
   * @param sourceData - 完整数据源（通常是 table.originalRows 或 table.rows）
   * 
   * @remarks
   * 此方法会按顺序执行：
   * 1. **过滤**：根据 filterExpression 过滤数据
   * 2. **排序**：根据 sortExpression 排序数据
   * 3. **更新**：将结果赋值给 this.rows
   * 
   * 注意事项：
   * - 不会触发通知，需要调用方手动触发
   * - 过滤/排序失败会记录错误日志，不会抛出异常
   * - 创建数据副本，不会修改源数据
   * 
   * @example
   * ```typescript
   * // 重新应用过滤和排序
   * context.updateRows(table.originalRows)
   * 
   * // 主从表场景：子表基于父表选中行过滤
   * const filtered = parentTable.originalRows.filter(r => r.parentId === parentRow.id)
   * childContext.updateRows(filtered)
   * ```
   */
  updateRows(sourceData: IDataRow[]): void {
    let result = [...sourceData];
    
    // 注意：filterExpression 应传给后端 API，前端不执行
    // 如果需要过滤，应从后端获取已过滤的数据
    
    // 执行排序
    if (this.sortExpression) {
      try {
        result = this.applySorting(result, this.sortExpression);
      } catch (e) {
        this.logger.error(`排序失败:`, e);
      }
    }
    
    this.rows = result;
  }

  /**
   * 刷新上下文（重新应用过滤和排序）
   * @param sourceData 完整数据源
   */
  refresh(sourceData: IDataRow[]): void {
    this.updateRows(sourceData);
    console.info(`✅ [Refresh] 上下文 ${this.contextId} 已刷新，当前 ${this.rows.length} 行`);
  }

  /**
   * 清理无效的选中状态
   * 检查 currentRow 和 selectedRows 是否还在当前上下文的 rows 中
   * @returns 是否发生了清理操作
   */
  cleanupInvalidSelections(): boolean {
    const contextRows = this.rows || [];
    let needsCleanup = false;
    
    // 检查 currentRow
    if (this.currentRow) {
      const currentRowExists = contextRows.some(row => 
        JSON.stringify(row) === JSON.stringify(this.currentRow)
      );
      
      if (!currentRowExists) {
        console.info(`🧹 [Cleanup] ${this.hostTable}.${this.contextId}.currentRow 不在上下文数据中，清空`);
        this.currentRow = null;
        needsCleanup = true;
      }
    }
    
    // 检查 selectedRows
    if (this.selectedRows && this.selectedRows.length > 0) {
      const validSelectedRows = this.selectedRows.filter(selectedRow => {
        const selectedRowStr = JSON.stringify(selectedRow)
        return contextRows.some(row => JSON.stringify(row) === selectedRowStr)
      });
      
      if (validSelectedRows.length !== this.selectedRows.length) {
        console.info(`🧹 [Cleanup] ${this.hostTable}.${this.contextId}.selectedRows 清理: ${this.selectedRows.length} -> ${validSelectedRows.length}`);
        this.selectedRows = validSelectedRows;
        needsCleanup = true;
      }
    }
    
    return needsCleanup;
  }

  /**
   * 转换为纯数据对象（新）
   */
  toData(): IViewMetadata {
    return {
      // 配置数据
      hostTable: this.__hostTable,
      contextId: this.__contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      autoSelectFirst: this.autoSelectFirst,
      autoDeselectOnEmpty: this.autoDeselectOnEmpty,
      // 分页配置
      page: this.page,
      pageSize: this.pageSize
    }
  }

  /**
   * 转换为普通对象（用于序列化）
   * @deprecated 请使用 toData() 方法
   */
  toJSON() {
    return this.toData()
  }

  /**
   * 从数据对象创建实例（新）
   */
  static fromData(data: IViewMetadata, hostTable: string, contextId: string, dataSet?: IDataSet): DataView {
    const context = new DataView(hostTable, contextId, dataSet)

    // 配置数据
    context.filterExpression = data.filterExpression
    context.sortExpression = data.sortExpression
    context.autoSelectFirst = data.autoSelectFirst
    context.autoDeselectOnEmpty = data.autoDeselectOnEmpty
    // 分页配置
    context.page = data.page ?? 1
    context.pageSize = data.pageSize ?? 20

    // 运行时状态使用默认值（不从配置中恢复）
    // currentRow, selectedRows, rows 等运行时状态应该在运行时设置

    return context
  }

  /**
   * 从普通对象创建实例
   * @deprecated 请使用 fromData() 方法
   */
  static fromJSON(data: Partial<IDataView>, hostTable: string, contextId: string, dataSet?: IDataSet): DataView {
    return DataView.fromData(data as IViewMetadata, hostTable, contextId, dataSet)
  }
}
