/**
 * 按组件级别分类的能力接口定义
 * 
 * 架构说明（从上到下）：
 * - 应用层：全局配置、路由管理
 * - DataSet（页面上下文）：为模型级组件提供数据表管理、全局服务等能力
 * - 沙箱（业务脚本）：可访问 DataSet 所有能力，可控制所有层级组件
 * - 模型级组件：为实例级组件提供数据源、选择管理等能力
 * - 实例级组件：为字段级组件提供数据绑定、权限控制等能力
 * - 字段级组件：为上游提供渲染控制、事件通知等能力
 * 
 * 能力流动方向：
 * 应用层 ──► DataSet ──► 模型级 ──► 实例级 ──► 字段级
 *              ▲
 *              │
 *            沙箱（访问能力 + 控制组件）
 */

import type { IModelPermission, IInstancePermission, DataRow, FieldVisibility } from '@spark-view/spark-utils'

// ==================== 沙箱能力接口 ====================

/**
 * 组件控制能力
 * 
 * 沙箱通过此能力获取和控制页面上的组件
 */
export interface IComponentControlCapability {
  name: 'componentControl'
  implementation: {
    /**
     * 获取组件实例
     * @param componentId 组件 ID
     * @returns 组件实例（类型根据组件级别不同而不同）
     */
    getComponent(componentId: string): unknown
    
    /**
     * 获取所有组件
     * @returns 组件 ID 到组件实例的映射
     */
    getAllComponents(): Record<string, unknown>
    
    /**
     * 检查组件是否存在
     * @param componentId 组件 ID
     */
    hasComponent(componentId: string): boolean
  }
}

/**
 * 沙箱执行上下文能力
 * 
 * 沙箱提供的全局执行上下文
 */
export interface ISandboxContextCapability {
  name: 'sandboxContext'
  implementation: {
    /** 访问能力系统 */
    use<T = unknown>(capabilityName: string): T
    
    /** 获取组件实例 */
    getComponent(componentId: string): unknown
    
    /** 页面级 logger 实例（由页面上下文注入） */
    log: {
      log(...args: unknown[]): void
      warn(...args: unknown[]): void
      error(...args: unknown[]): void
      info?(...args: unknown[]): void
      debug?(...args: unknown[]): void
    }
    
    /** 定时器（受限） */
    setTimeout(callback: () => void, delay: number): number
    clearTimeout(id: number): void
    setInterval(callback: () => void, delay: number): number
    clearInterval(id: number): void
  }
}

/**
 * 沙箱生命周期钩子
 * 
 * 业务脚本可以导出的生命周期函数
 */
export interface ISandboxLifecycleHooks {
  /** 页面挂载完成 */
  onPageMounted?(): void | Promise<void>
  
  /** 页面更新 */
  onPageUpdated?(): void | Promise<void>
  
  /** 页面卸载前 */
  onPageBeforeUnmount?(): void | Promise<void>
  
  /** 页面卸载完成 */
  onPageUnmounted?(): void | Promise<void>
}

/**
 * 沙箱初始化配置
 * 
 * 创建沙箱时需要注入的页面级对象
 */
export interface ISandboxInitConfig {
  /** 页面级 logger 实例 */
  logger: {
    log(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    info?(...args: unknown[]): void
    debug?(...args: unknown[]): void
  }
  
  /** 页面 ID（用于日志标识） */
  pageId?: string
  
  /** 其他页面级注入对象 */
  [key: string]: unknown
}

// ==================== DataSet（页面上下文）提供的能力 ====================

/**
 * DataSet 状态能力
 * 
 * DataSet（页面数据管理层）提供，模型级组件消费
 */
export interface IDataSetStateCapability {
  name: 'dataSetState'
  implementation: {
    /** 获取 DataSet 实例 */
    getDataSet(): unknown  // IDataSet 类型待定义
    
    /** 获取指定数据表 */
    getTable(tableName: string): unknown  // IDataTable 类型待定义
    
    /** 获取页面参数（路由参数、查询参数） */
    getPageParams(): Record<string, unknown>
    
    /** 获取页面级权限 */
    getPagePermission(): Record<string, boolean>
    
    /** 监听数据表变化 */
    onTableChange(tableName: string, callback: (table: unknown) => void): () => void
  }
}

/**
 * 全局数据能力
 * 
 * 页面上下文提供，提供用户信息、字典等全局数据
 */
export interface IGlobalDataCapability {
  name: 'globalData'
  implementation: {
    /** 获取全局用户信息 */
    getUserInfo(): { id: string; name: string; roles: string[] }
    
    /** 获取全局配置 */
    getConfig(key: string): unknown
    
    /** 获取字典数据 */
    getDictionary(type: string): Array<{ label: string; value: unknown }>
  }
}

/**
 * 页面服务能力
 * 
 * 页面上下文提供，提供消息、对话框、导航等服务
 */
export interface IPageServiceCapability {
  name: 'pageService'
  implementation: {
    /** 显示消息提示 */
    showMessage(message: string, type: 'success' | 'error' | 'warning'): void
    
    /** 显示确认对话框 */
    showConfirm(message: string): Promise<boolean>
    
    /** 显示加载状态 */
    showLoading(show: boolean): void
    
    /** 页面导航 */
    navigate(path: string, params?: Record<string, unknown>): void
  }
}

/**
 * API 调用能力
 * 
 * 页面上下文提供，统一管理 API 请求
 */
export interface IApiClientCapability {
  name: 'apiClient'
  implementation: {
    /** 统一的 API 请求方法 */
    request<T>(config: { url: string; method: string; data?: unknown }): Promise<T>
    
    /** 获取 API 基础配置 */
    getApiConfig(): { baseURL: string; timeout: number }
  }
}

// ==================== 模型级组件提供的能力 ====================

/**
 * 数据源能力
 * 
 * 模型级组件（Grid、CardList）提供给实例级组件（行、Card）
 */
export interface IDataSourceCapability {
  name: 'dataSource'
  implementation: {
    /** 获取完整数据表 */
    getData(): DataRow[]
    
    /** 获取模型级权限 */
    getModelPermission(): IModelPermission
    
    /** 刷新数据 */
    refresh(): Promise<void>
    
    /** 监听数据变化 */
    onDataChange(callback: (data: DataRow[]) => void): () => void
  }
}

/**
 * 选择管理能力
 * 
 * 模型级组件提供，管理多行/多项选择
 */
export interface ISelectionManagerCapability {
  name: 'selectionManager'
  implementation: {
    /** 获取选中的行 */
    getSelectedRows(): DataRow[]
    
    /** 设置选中的行 */
    setSelectedRows(rows: DataRow[]): void
    
    /** 监听选中变化 */
    onSelectionChange(callback: (rows: DataRow[]) => void): () => void
    
    /** 清除选中 */
    clearSelection(): void
  }
}

/**
 * 查询管理能力
 * 
 * 模型级组件提供，管理排序、过滤
 */
export interface IQueryManagerCapability {
  name: 'queryManager'
  implementation: {
    /** 获取当前排序配置 */
    getSortConfig(): Array<{ field: string; order: 'asc' | 'desc' }>
    
    /** 获取当前过滤配置 */
    getFilterConfig(): Record<string, unknown>
    
    /** 应用排序 */
    applySort(config: Array<{ field: string; order: 'asc' | 'desc' }>): void
    
    /** 应用过滤 */
    applyFilter(config: Record<string, unknown>): void
  }
}

/**
 * 批量操作能力
 * 
 * 模型级组件提供，处理批量操作
 */
export interface IBatchOperatorCapability {
  name: 'batchOperator'
  implementation: {
    /** 批量删除 */
    batchDelete(rows: DataRow[]): Promise<void>
    
    /** 批量更新 */
    batchUpdate(updates: Array<{ row: DataRow; data: Record<string, unknown> }>): Promise<void>
    
    /** 批量导出 */
    batchExport(rows: DataRow[]): Promise<void>
  }
}

// ==================== 实例级组件提供的能力 ====================

/**
 * 数据绑定能力
 * 
 * 实例级组件（Grid 行、Card、Form）提供给字段级组件
 */
export interface IDataBindingCapability {
  name: 'dataBinding'
  implementation: {
    /** 获取当前行数据 */
    getRowData(): DataRow
    
    /** 获取字段值 */
    getFieldValue(field: string): unknown
    
    /** 设置字段值 */
    setFieldValue(field: string, value: unknown): void
    
    /** 监听字段变化 */
    onFieldChange(field: string, callback: (value: unknown) => void): () => void
    
    /** 监听整行数据变化 */
    onRowChange(callback: (row: DataRow) => void): () => void
  }
}

/**
 * 实例权限能力
 * 
 * 实例级组件提供，控制字段级权限
 */
export interface IInstancePermissionCapability {
  name: 'instancePermission'
  implementation: {
    /** 获取实例级权限 */
    getPermission(): IInstancePermission
    
    /** 检查是否可删除 */
    canDelete(): boolean
    
    /** 检查字段是否可编辑 */
    canEditField(field: string): boolean
    
    /** 获取字段可见性 */
    getFieldVisibility(field: string): FieldVisibility
    
    /** 获取字段脱敏值 */
    getMaskedValue(field: string): string
  }
}

/**
 * 表单验证能力
 * 
 * 实例级组件提供，管理字段验证
 */
export interface IFormValidatorCapability {
  name: 'formValidator'
  implementation: {
    /** 验证单个字段 */
    validateField(field: string): Promise<{ valid: boolean; message?: string }>
    
    /** 验证整个实例 */
    validateRow(): Promise<{ valid: boolean; errors: Record<string, string> }>
    
    /** 添加验证规则 */
    addRule(field: string, rule: (value: unknown) => boolean | Promise<boolean>): void
    
    /** 清除验证状态 */
    clearValidation(field?: string): void
  }
}

/**
 * 编辑状态能力
 * 
 * 实例级组件提供，管理编辑模式
 */
export interface IEditStateCapability {
  name: 'editState'
  implementation: {
    /** 是否处于编辑模式 */
    isEditing(): boolean
    
    /** 进入编辑模式 */
    startEdit(): void
    
    /** 提交编辑 */
    commitEdit(): Promise<void>
    
    /** 取消编辑 */
    cancelEdit(): void
    
    /** 获取变更的字段 */
    getChangedFields(): string[]
    
    /** 监听编辑状态变化 */
    onEditStateChange(callback: (editing: boolean) => void): () => void
  }
}

// ==================== 字段级组件提供的能力 ====================

/**
 * 字段渲染能力
 * 
 * 字段级组件（Input、Select、Text）提供给上游或兄弟组件
 */
export interface IFieldRendererCapability {
  name: 'fieldRenderer'
  implementation: {
    /** 获取字段名 */
    getFieldName(): string
    
    /** 获取显示值 */
    getDisplayValue(): string
    
    /** 获取原始值 */
    getRawValue(): unknown
    
    /** 设置焦点 */
    focus(): void
    
    /** 触发验证 */
    validate(): Promise<boolean>
  }
}

/**
 * 字段事件能力
 * 
 * 字段级组件提供，通知字段事件
 */
export interface IFieldEventsCapability {
  name: 'fieldEvents'
  implementation: {
    /** 监听值变化 */
    onValueChange(callback: (value: unknown) => void): () => void
    
    /** 监听焦点事件 */
    onFocus(callback: () => void): () => void
    
    /** 监听失焦事件 */
    onBlur(callback: () => void): () => void
    
    /** 触发自定义事件 */
    emit(event: string, data: unknown): void
  }
}

// ==================== 组件级别能力映射 ====================

/**
 * 沙箱能力集合
 */
export type SandboxCapabilities =
  | IComponentControlCapability
  | ISandboxContextCapability

/**
 * DataSet（页面上下文）能力集合
 */
export type DataSetCapabilities =
  | IDataSetStateCapability
  | IGlobalDataCapability
  | IPageServiceCapability
  | IApiClientCapability

/**
 * 模型级组件能力集合
 */
export type ModelLevelCapabilities =
  | IDataSourceCapability
  | ISelectionManagerCapability
  | IQueryManagerCapability
  | IBatchOperatorCapability

/**
 * 实例级组件能力集合
 */
export type InstanceLevelCapabilities =
  | IDataBindingCapability
  | IInstancePermissionCapability
  | IFormValidatorCapability
  | IEditStateCapability

/**
 * 字段级组件能力集合
 */
export type FieldLevelCapabilities =
  | IFieldRendererCapability
  | IFieldEventsCapability

/**
 * 所有按级别分类的能力
 */
export type LevelBasedCapabilities =
  | DataSetCapabilities
  | ModelLevelCapabilities
  | InstanceLevelCapabilities
  | FieldLevelCapabilities

// ==================== 能力提供者接口 ====================

/**
 * DataSet（页面上下文）能力提供者
 */
export interface IDataSetProvider {
  /** 层级 */
  level: 'dataset'
  
  /** 提供的能力列表 */
  provides: DataSetCapabilities[]
}

/**
 * 模型级能力提供者
 */
export interface IModelLevelProvider {
  /** 组件级别 */
  level: 'model'
  
  /** 提供的能力列表 */
  provides: ModelLevelCapabilities[]
  
  /** 消费的 DataSet 能力 */
  consumes?: DataSetCapabilities['name'][]
}

/**
 * 实例级能力提供者
 */
export interface IInstanceLevelProvider {
  /** 组件级别 */
  level: 'instance'
  
  /** 提供的能力列表 */
  provides: InstanceLevelCapabilities[]
  
  /** 消费的上游能力（可跨级访问 DataSet） */
  consumes?: (DataSetCapabilities['name'] | ModelLevelCapabilities['name'])[]
}

/**
 * 字段级能力提供者
 */
export interface IFieldLevelProvider {
  /** 组件级别 */
  level: 'field'
  
  /** 提供的能力列表 */
  provides: FieldLevelCapabilities[]
  
  /** 消费的上游能力（可跨级访问） */
  consumes?: (
    | DataSetCapabilities['name']
    | ModelLevelCapabilities['name']
    | InstanceLevelCapabilities['name']
  )[]
}

/**
 * 能力提供者联合类型
 */
export type CapabilityProvider =
  | IDataSetProvider
  | IModelLevelProvider
  | IInstanceLevelProvider
  | IFieldLevelProvider
