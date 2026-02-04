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

// ==================== 实例级权限 ====================

/**
 * 数据行/实例权限
 * 
 * 概念区分：
 * - “权”：允许与否（allowDelete）
 * - “限”：能搞到什么程度（editableFields, hiddenFields, maskedFields）
 * 
 * 说明：
 * - 查看权限：后端返回的数据即表示可见，无需 allowView 字段
 * - 导出权限：根据后端返回的数据范围确定
 * 
 * 字段权限通过标志集合控制：
 * - editableFields: 可编辑字段列表
 * - hiddenFields: 不可见字段列表
 * - maskedFields: 脱敏字段列表
 * 
 * 字段权限组合逻辑：
 * 1. 未在任何列表中的字段：完全可见、只读
 * 2. 仅在 editableFields：可见、可编辑
 * 3. 仅在 hiddenFields：不可见、不可编辑
 * 4. 仅在 maskedFields：脱敏可见、只读
 * 5. hiddenFields + editableFields：不可见但可提交（如密码修改）
 * 6. maskedFields + editableFields：脱敏可见、可编辑（如部分修改手机号）
 * 
 * 示例：
 * {
 *   editableFields: ['name', 'password'],     // name 可编辑，password 不可见但可提交
 *   hiddenFields: ['password'],               // password 不显示
 *   maskedFields: ['phone']                   // phone 脱敏显示，只读
 * }
 */
export interface IInstancePermission {
  /** 是否允许删除此实例 */
  allowDelete?: boolean
  
  // ========== 字段级权限标志集合 ==========
  // 注意：无需 allowEdit 字段，editableFields 有值即表示可编辑
  
  /** 可编辑字段列表（可写入数据） */
  editableFields?: string[]
  /** 不可见字段列表（不显示在 UI） */
  hiddenFields?: string[]
  /** 脱敏字段列表（显示脱敏后的值） */
  maskedFields?: string[]
}

// ==================== 模型级权限 ====================

/**
 * 数据模型/表级权限
 * 
 * 概念区分：
 * - “权”：允许与否（allow*）
 * - “限”：能搞到什么程度（字段列表等）
 * 
 * 权限裁决逻辑：
 * - allowCreate: 控制是否可新增，由后端根据新增权限裁决
 * - allowImport: 控制是否可导入，由后端按新增/编辑权限裁决
 * - allowExport: 控制是否可导出，由后端按返回的数据范围裁决
 * - 批量删除: 根据返回的实例中有多少个 allowDelete=true 确定
 */
export interface IModelPermission {
  /** 是否允许新增 */
  allowCreate?: boolean
  /** 是否允许导入（后端按新增/编辑权限裁决） */
  allowImport?: boolean
  /** 是否允许导出（后端按查看范围裁决） */
  allowExport?: boolean
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
  /** 实例级权限映射（key 为数据行标识，每个实例通过标志集合控制字段权限） */
  instancePermissions?: Map<string | number, IInstancePermission>
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
 * 后端返回的数据格式示例：
 * 
 * 示例 1：常规编辑（name 可编辑，phone 脱敏只读）
 * {
 *   id: 1,
 *   name: "张三",
 *   phone: "13800138000",
 *   _perm: {
 *     allowDelete: false,
 *     editableFields: ["name"],        // 有可编辑字段即表示可编辑
 *     maskedFields: ["phone"]
 *   }
 * }
 * 
 * 示例 2：密码修改（password 不可见但可提交）
 * {
 *   id: 1,
 *   username: "zhangsan",
 *   _perm: {
 *     editableFields: ["password"],    // 密码可提交
 *     hiddenFields: ["password"]        // 密码不显示
 *   }
 * }
 * 
 * 示例 3：薪资查看（salary 脱敏显示但可编辑）
 * {
 *   id: 1,
 *   name: "李四",
 *   salary: 8000,
 *   _perm: {
 *     editableFields: ["name", "salary"],
 *     maskedFields: ["salary"]          // 显示脱敏值但可编辑
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
  canImport(modelPermission?: IModelPermission): boolean
  canExport(modelPermission?: IModelPermission): boolean
  
  /** 检查是否有实例操作权限 */
  canDelete(row: IPermissionDataRow): boolean
  canEdit(row: IPermissionDataRow): boolean
  
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
    allowImport: true,
    allowExport: true
  }
}

/**
 * 默认实例权限
 * 
 * 默认情况下：
 * - 允许删除
 * - 所有字段完全可见、只读（editableFields 为空）
 * - 如需字段可编辑，添加到 editableFields
 */
export const DEFAULT_INSTANCE_PERMISSION: IInstancePermission = {
  allowDelete: true,
  editableFields: [],
  hiddenFields: [],
  maskedFields: []
}
