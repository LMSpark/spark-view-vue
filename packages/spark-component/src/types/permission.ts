/**
 * 权限系统接口定义
 * 
 * 架构说明：
 * - 模型级权限（Model-level）：控制整个数据集的操作（如新增）
 * - 实例级权限（Instance-level）：控制单条数据的操作（如删除、编辑）
 * - 字段级权限（Field-level）：控制字段的可见性、可编辑性、脱敏
 * 
 * 职责划分（以浏览器为界）：
 * - 后端：权限裁决（决定什么数据可以到达浏览器，什么数据不能到达）
 * - 前端：权限渲染（数据到达浏览器就是可见的，前端控制如何显示）
 * 
 * 核心原则：
 * - 数据到达浏览器 = 用户有权查看
 * - Hidden 字段：后端不返回，永远不会到达浏览器
 * - Masked 字段：后端返回脱敏值到浏览器
 * - Visible 字段：后端返回完整值到浏览器
 */

// ==================== 字段级权限 ====================

/**
 * 字段可见性
 * 
 * 以浏览器为界：
 * - Visible: 后端返回完整值到浏览器
 * - Masked: 后端返回脱敏值到浏览器
 * - Hidden: 后端不返回，不会到达浏览器
 */
export enum FieldVisibility {
  /** 完全可见 */
  Visible = 'visible',
  /** 脱敏显示（如手机号 138****1234） */
  Masked = 'masked',
  /** 完全隐藏 */
  Hidden = 'hidden'
}

// ==================== 字段渲染配置 ====================

/**
 * 字段渲染配置
 * 
 * 用于字段级渲染与数据权限的匹配：
 * - field: 字段名，用于匹配权限中的 editableFields/hiddenFields/maskedFields
 * - visible: 字段是否可见（优先级低于权限）
 * - editable: 字段是否可编辑（优先级低于权限）
 * - maskRule: 自定义脱敏规则
 * 
 * 权限优先级：
 * 1. hiddenFields > visible（权限隐藏优先）
 * 2. editableFields > editable（权限可编辑优先）
 * 3. maskedFields > maskRule（权限脱敏优先）
 */
export interface IFieldRenderConfig {
  /** 字段名（与数据字段对应） */
  field: string
  
  /** 字段标题 */
  title?: string
  
  /** 字段是否可见（默认 true，权限中的 hiddenFields 优先） */
  visible?: boolean
  
  /** 字段是否可编辑（默认 false，权限中的 editableFields 优先） */
  editable?: boolean
  
  /** 自定义脱敏规则（权限中的 maskedFields 优先） */
  maskRule?: (value: unknown) => string
  
  /** 字段渲染类型（可选，用于 UI 组件选择） */
  type?: 'text' | 'number' | 'date' | 'select' | 'custom'
  
  /** 其他渲染选项 */
  [key: string]: unknown
}

/**
 * 字段渲染状态（运行时计算结果）
 * 
 * 结合字段配置和数据权限计算得出的最终渲染状态
 * 
 * 6种组合状态（读3种 × 写2种）：
 * 1. Visible + Editable：完全可见、可编辑（正常编辑）
 * 2. Visible + ReadOnly：完全可见、只读（只读显示）
 * 3. Masked + Editable：脱敏可见、可编辑（部分修改，如修改手机号）
 * 4. Masked + ReadOnly：脱敏可见、只读（脱敏显示）
 * 5. Hidden + Editable：不可见、可编辑（隐藏提交，如密码修改）
 * 6. Hidden + ReadOnly：不可见、只读（完全隐藏）
 * 
 * 以浏览器为界：
 * - displayValue 有值 = 数据已到达浏览器 = 用户有权查看
 * - displayValue 无值 = 数据未到达浏览器 = 后端拒绝返回
 */
export interface IFieldRenderState {
  /** 字段名 */
  field: string
  
  /** 读权限：字段可见性状态 */
  visibility: FieldVisibility
  
  /** 写权限：字段是否可编辑 */
  editable: boolean
  
  /** 
   * 显示值（后端返回的值）
   * - Visible: 完整值
   * - Masked: 脱敏后的值
   * - Hidden: undefined（不返回）
   */
  displayValue?: string
  
  /** 是否渲染（Hidden 时为 false，其他为 true） */
  shouldRender: boolean
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
 * - 查看权限：后端只返回用户有权查看的数据，无需 allowView 字段
 * - 导出权限：后端返回的数据即为可导出范围
 * - 编辑权限：后端通过 editableFields 指定可编辑字段，前端根据此控制 UI
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
 * 后端裁决，前端渲染：
 * - allowCreate: 后端根据用户新增权限裁决，前端根据此值显示/隐藏新增按钮
 * - allowImport: 后端按新增/编辑权限裁决，前端根据此值显示/隐藏导入按钮
 * - allowExport: 后端按返回的数据范围裁决，前端根据此值显示/隐藏导出按钮
 * - 批量删除: 后端返回可删除的实例，前端统计数量决定是否显示批删按钮
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
 * 字段渲染助手接口
 * 
 * 用于计算字段的最终渲染状态（结合配置和权限）
 */
export interface IFieldRenderHelper {
  /**
   * 计算字段渲染状态
   * 
   * @param config 字段配置
   * @param row 数据行（包含权限）
   * @param checker 权限检查器
   * @returns 字段渲染状态
   */
  computeFieldState(
    config: IFieldRenderConfig,
    row: IPermissionDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState
  
  /**
   * 批量计算字段渲染状态
   * 
   * @param configs 字段配置列表
   * @param row 数据行（包含权限）
   * @param checker 权限检查器
   * @returns 字段渲染状态列表
   */
  computeFieldStates(
    configs: IFieldRenderConfig[],
    row: IPermissionDataRow,
    checker: IPermissionChecker
  ): IFieldRenderState[]
  
  /**
   * 过滤出可见字段配置
   * 
   * @param configs 字段配置列表
   * @param row 数据行（包含权限）
   * @param checker 权限检查器
   * @returns 可见字段配置
   */
  filterVisibleFields(
    configs: IFieldRenderConfig[],
    row: IPermissionDataRow,
    checker: IPermissionChecker
  ): IFieldRenderConfig[]
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
