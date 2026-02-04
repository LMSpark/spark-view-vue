/**
 * 权限系统接口定义
 * 
 * 架构说明：
 * - 模型级权限（Model-level）：控制整个数据集的操作（如新增）
 * - 实例级权限（Instance-level）：控制单条数据的操作（如删除、编辑）
 * - 字段级权限（Field-level）：控制字段的可见性、可编辑性、脱敏
 * 
 * 权限来源：
 * - 权限随数据从后端返回
 * - 前端根据权限控制 UI 行为
 */

// ==================== 字段级权限 ====================

/**
 * 字段可见性
 */
export enum FieldVisibility {
  /** 完全可见 */
  Visible = 'visible',
  /** 脱敏显示（如手机号 138****1234） */
  Masked = 'masked',
  /** 完全隐藏 */
  Hidden = 'hidden'
}

/**
 * 字段编辑权限
 * 
 * 从数据角度只有两种状态：
 * - Editable: 可写（允许修改数据）
 * - ReadOnly: 只读（不允许修改数据）
 */
export enum FieldEditMode {
  /** 可编辑（可写） */
  Editable = 'editable',
  /** 只读（不可写） */
  ReadOnly = 'readonly'
}

/**
 * 字段权限配置
 */
export interface IFieldPermission {
  /** 字段名 */
  field: string
  /** 可见性 */
  visibility?: FieldVisibility
  /** 编辑权限 */
  editMode?: FieldEditMode
  /** 自定义脱敏规则（当 visibility 为 Masked 时使用） */
  maskRule?: (value: unknown) => string
}

// ==================== 实例级权限 ====================

/**
 * 数据行/实例权限
 */
export interface IInstancePermission {
  /** 是否允许删除此实例 */
  allowDelete?: boolean
  /** 是否允许编辑此实例 */
  allowEdit?: boolean
  /** 是否允许查看详情 */
  allowView?: boolean
  /** 可编辑的字段列表（优先级高于字段级权限） */
  editableFields?: string[]
  /** 只读字段列表 */
  readonlyFields?: string[]
  /** 隐藏字段列表 */
  hiddenFields?: string[]
  /** 脱敏字段列表 */
  maskedFields?: string[]
  /** 自定义权限扩展 */
  custom?: Record<string, unknown>
}

// ==================== 模型级权限 ====================

/**
 * 数据模型/表级权限
 */
export interface IModelPermission {
  /** 是否允许新增 */
  allowCreate?: boolean
  /** 是否允许批量删除 */
  allowBatchDelete?: boolean
  /** 是否允许导出 */
  allowExport?: boolean
  /** 是否允许导入 */
  allowImport?: boolean
  /** 默认字段权限（影响所有实例） */
  defaultFieldPermissions?: IFieldPermission[]
  /** 自定义权限扩展 */
  custom?: Record<string, unknown>
}

// ==================== 组件权限接口 ====================

/**
 * 组件通用权限接口
 * 
 * 所有 SPARK 组件都应实现此接口，以支持统一的权限控制
 */
export interface IComponentPermission {
  /** 组件是否可见 */
  visible?: boolean
  /** 组件是否禁用 */
  disabled?: boolean
  /** 组件是否只读 */
  readonly?: boolean
  /** 模型级权限（如 Grid 的新增权限） */
  modelPermission?: IModelPermission
  /** 实例级权限映射（key 为数据行标识） */
  instancePermissions?: Map<string | number, IInstancePermission>
  /** 字段级权限配置 */
  fieldPermissions?: IFieldPermission[]
}

// ==================== 组件操作接口 ====================

/**
 * 组件数据操作接口
 * 
 * 所有数据组件（Grid、Form、Tree 等）都应实现此接口
 */
export interface IDataComponent {
  /** 刷新数据 */
  refresh(): Promise<void>
  
  /** 重新加载数据（清空缓存） */
  reload(): Promise<void>
  
  /** 显示组件 */
  show(): void
  
  /** 隐藏组件 */
  hide(): void
  
  /** 设置只读模式 */
  setReadonly(readonly: boolean): void
  
  /** 设置禁用状态 */
  setDisabled(disabled: boolean): void
  
  /** 获取当前权限配置 */
  getPermission(): IComponentPermission
  
  /** 更新权限配置 */
  setPermission(permission: Partial<IComponentPermission>): void
}

// ==================== 权限数据结构 ====================

/**
 * 带权限的数据行
 * 
 * 后端返回的数据格式建议：
 * {
 *   id: 1,
 *   name: "张三",
 *   phone: "13800138000",
 *   _perm: {
 *     allowDelete: false,
 *     allowEdit: true,
 *     readonlyFields: ["phone"],
 *     maskedFields: []
 *   }
 * }
 */
export interface IPermissionDataRow {
  /** 数据字段 */
  [key: string]: unknown
  
  /** 实例级权限（约定字段名） */
  _perm?: IInstancePermission
}

/**
 * 带权限的数据集
 */
export interface IPermissionDataSet<T = IPermissionDataRow> {
  /** 数据行列表 */
  rows: T[]
  
  /** 模型级权限 */
  permission?: IModelPermission
  
  /** 总记录数 */
  total?: number
  
  /** 其他元数据 */
  [key: string]: unknown
}

// ==================== 权限工具函数接口 ====================

/**
 * 权限检查器接口
 */
export interface IPermissionChecker {
  /** 检查是否有模型操作权限 */
  canCreate(modelPermission?: IModelPermission): boolean
  canBatchDelete(modelPermission?: IModelPermission): boolean
  canExport(modelPermission?: IModelPermission): boolean
  
  /** 检查是否有实例操作权限 */
  canDelete(row: IPermissionDataRow): boolean
  canEdit(row: IPermissionDataRow): boolean
  canView(row: IPermissionDataRow): boolean
  
  /** 检查字段权限 */
  isFieldVisible(field: string, row: IPermissionDataRow): boolean
  isFieldEditable(field: string, row: IPermissionDataRow): boolean
  getFieldVisibility(field: string, row: IPermissionDataRow): FieldVisibility
  
  /** 应用脱敏规则 */
  maskFieldValue(field: string, value: unknown, row: IPermissionDataRow): string
}

/**
 * 权限过滤器接口
 */
export interface IPermissionFilter {
  /** 过滤出可删除的行 */
  filterDeletableRows(rows: IPermissionDataRow[]): IPermissionDataRow[]
  
  /** 过滤出可编辑的行 */
  filterEditableRows(rows: IPermissionDataRow[]): IPermissionDataRow[]
  
  /** 过滤字段（移除隐藏字段） */
  filterFields(row: IPermissionDataRow): Record<string, unknown>
  
  /** 应用字段脱敏 */
  applyFieldMasking(row: IPermissionDataRow): IPermissionDataRow
  
  /** 批量应用脱敏（处理整个数据集） */
  applyMaskingToDataSet(rows: IPermissionDataRow[]): IPermissionDataRow[]
}

// ==================== 能力接口 ====================

/**
 * 权限管理能力（Capability）
 * 
 * 组件通过能力系统提供/消费权限管理功能
 */
export interface IPermissionCapability {
  /** 能力名称 */
  name: 'permissionManager'
  
  /** 能力实现 */
  implementation: {
    /** 获取当前权限配置 */
    getPermission(): IComponentPermission
    
    /** 更新权限配置 */
    updatePermission(permission: Partial<IComponentPermission>): void
    
    /** 检查权限 */
    check: IPermissionChecker
    
    /** 过滤数据 */
    filter: IPermissionFilter
  }
}

// ==================== 默认值常量 ====================

/**
 * 默认权限配置
 */
export const DEFAULT_PERMISSION: IComponentPermission = {
  visible: true,
  disabled: false,
  readonly: false,
  modelPermission: {
    allowCreate: true,
    allowBatchDelete: true,
    allowExport: true,
    allowImport: true
  }
}

/**
 * 默认字段权限
 */
export const DEFAULT_FIELD_PERMISSION: IFieldPermission = {
  field: '*',
  visibility: FieldVisibility.Visible,
  editMode: FieldEditMode.Editable
}

/**
 * 默认实例权限
 */
export const DEFAULT_INSTANCE_PERMISSION: IInstancePermission = {
  allowDelete: true,
  allowEdit: true,
  allowView: true,
  editableFields: [],
  readonlyFields: [],
  hiddenFields: [],
  maskedFields: []
}
