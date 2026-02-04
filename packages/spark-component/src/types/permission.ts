/**
 * 权限系统接口定义
 * 
 * ⚠️ 重要：数据权限类型只使用不定义
 * - IInstancePermission, IModelPermission 等数据权限类型从 spark-data 导入
 * - 本文件只定义组件层特有的类型（FieldVisibility, IComponentPermission 等）
 * - 不允许重新定义或创建数据权限类型的实例
 * 
 * 架构分层：
 * - 基础层（@spark-view/spark-data）：定义基础权限类型（唯一来源）
 * - 组件层（本文件）：扩展UI组件友好的接口和工具
 * 
 * 类型复用：
 * - 所有基础权限类型从 spark-data 导入
 * - 本文件定义组件层特定功能（FieldVisibility, ComponentLevel等）
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
 * 
 * 客户端渲染原则：
 * - **没有权限信息 = 可见只读**（默认安全）
 * - 可见只读 ≈ 脱敏只读（都是只读状态，仅显示内容不同）
 * - 只读状态统一处理：disabled、readonly、不显示编辑按钮
 * - 可编辑标志：仅当字段在 editableFields 列表中
 */

// ==================== 从 spark-data 导入基础权限类型 ====================

import type {
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission
} from '@spark-view/spark-data'

// 导入基础数据类型
import type { DataRow as BaseDataRow } from '@spark-view/spark-data'

// 重新导出供其他模块使用
export type {
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission
}

// 权限字段常量（本地定义，避免构建时循环依赖）
export const INSTANCE_PERMISSION_FIELD = '_perm' as const
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

// ==================== 组件层数据类型（基于 spark-data）====================

/**
 * 组件层数据行类型（带可选权限）
 * 
 * 基于 spark-data 的 DataRow，添加权限支持
 * 用于组件接口定义，简化类型标注
 */
export type DataRow = WithInstancePermission<BaseDataRow>

/**
 * 组件层数据集类型（带可选权限）
 * 
 * 用于表格、列表等组件的数据源
 */
export interface DataSet {
  rows: DataRow[]
  _modelPerm?: IModelPermission
  total?: number
  [key: string]: unknown
}

// ==================== 字段级权限 ====================

/**
 * 字段可见性
 * 
 * 以浏览器为界：
 * - Visible: 后端返回完整值到浏览器（可见只读或可编辑）
 * - Masked: 后端返回脱敏值到浏览器（脱敏只读或可编辑）
 * - Hidden: 后端不返回，不会到达浏览器
 * 
 * 客户端只读状态统一：
 * - Visible + 不可编辑 = 可见只读（显示原始值，disabled）
 * - Masked + 不可编辑 = 脱敏只读（显示脱敏值，disabled）
 * - 两者本质相同：都是只读，仅显示内容不同
 * - 可编辑标志：字段在 editableFields 中
 */
export enum FieldVisibility {
  /** 完全可见（原始值显示） */
  Visible = 'visible',
  /** 脱敏显示（如手机号 138****1234） */
  Masked = 'masked',
  /** 完全隐藏（不渲染） */
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

// ==================== 组件级别 ====================

/**
 * 组件级别
 * 
 * 按操作粒度分为3类，与权限系统3个级别对应：
 * - Model: 模型级组件（管理整个数据表，如 Grid 表格、CardList 卡片视图）
 * - Instance: 实例级组件（操作单条数据，如 Grid 行、单个 Card、Form 表单）
 * - Field: 字段级组件（操作单个字段，如 Input、Text 显示组件）
 */
export enum ComponentLevel {
  /** 模型级组件：管理整个数据表（Grid 表格、CardList 视图） */
  Model = 'model',
  /** 实例级组件：操作单条数据（Grid 行、单个 Card、Form 表单） */
  Instance = 'instance',
  /** 字段级组件：操作单个字段（Input、Text 等） */
  Field = 'field'
}

/**
 * 组件权限配置（按级别）
 */
export interface IComponentPermissionConfig {
  /** 组件级别 */
  level: ComponentLevel
  
  /** 模型级权限（level=Model 时使用） */
  modelPermission?: IModelPermission
  
  /** 实例级权限（level=Instance 时使用） */
  instancePermission?: IInstancePermission
  
  /** 字段级权限（level=Field 时使用） */
  fieldPermission?: {
    field: string
    permission: IInstancePermission
  }
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
  canDelete(row: DataRow): boolean
  canEdit(row: DataRow): boolean
  
  /** 检查字段权限 */
  isFieldVisible(field: string, row: DataRow): boolean
  isFieldEditable(field: string, row: DataRow): boolean
  getFieldVisibility(field: string, row: DataRow): FieldVisibility
  
  /** 应用脱敏规则 */
  maskFieldValue(field: string, value: unknown, row: DataRow): string
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
    row: DataRow,
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
    row: DataRow,
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
    row: DataRow,
    checker: IPermissionChecker
  ): IFieldRenderConfig[]
}

/**
 * 权限过滤器接口
 */
export interface IPermissionFilter {
  /** 过滤出可删除的行 */
  filterDeletableRows(rows: DataRow[]): DataRow[]
  
  /** 过滤出可编辑的行 */
  filterEditableRows(rows: DataRow[]): DataRow[]
  
  /** 过滤字段（移除隐藏字段） */
  filterFields(row: DataRow): Record<string, unknown>
  
  /** 应用字段脱敏 */
  applyFieldMasking(row: DataRow): DataRow
  
  /** 批量应用脱敏（处理整个数据集） */
  applyMaskingToDataSet(rows: DataRow[]): DataRow[]
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
 * 默认组件权限配置
 * 
 * 组件层配置，非数据权限
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
