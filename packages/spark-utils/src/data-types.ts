/**
 * 基础数据类型定义
 * 
 * ⚠️ 重要：这是数据和权限类型的唯一定义源
 * - 所有基础数据结构必须在此文件中定义
 * - 其他包只能导入使用，不能重新定义
 * - 保持类型系统的一致性和可维护性
 * 
 * 架构说明：
 * - 这些是最基础的数据结构，位于工具层
 * - 可被所有其他包共享使用
 * - 包含数据行、权限等基础概念
 */

// ==================== 基础数据类型 ====================

/**
 * 数据行：键值对结构（纯数据，无权限）
 * 
 * 这是最基础的数据行定义，不包含权限信息
 */
export type DataRow<T = unknown> = Record<string, T>

/**  
 * 带权限的数据行（组件层常用）
 * 
 * 这是组件层常用的数据行类型，包含可选的权限信息
 * 相当于 DataRow + 权限支持
 */
export type ComponentDataRow<T = unknown> = WithInstancePermission<DataRow<T>>

// ==================== 实例级权限（行级） ====================

/**
 * 实例级权限：单条数据的权限控制
 * 
 * 后端返回，前端根据这些字段控制 UI：
 * - allowDelete: 控制删除按钮可见性
 * - editableFields: 控制字段编辑状态
 * - hiddenFields: 控制字段显示/隐藏
 * - maskedFields: 控制字段脱敏显示
 * 
 * 默认行为（当 _perm 不存在或字段未设置时）：
 * - 没有 _perm 字段 → 所有字段可见只读，不可删除
 * - _perm 存在但 editableFields 为空 → 所有字段只读
 * - _perm 存在但 allowDelete 未设置 → 不可删除
 * 
 * 客户端渲染状态统一：
 * - 可见只读：显示原始值，禁用编辑
 * - 脱敏只读：显示脱敏值，禁用编辑
 * - 本质都是只读，仅显示内容不同
 * 
 * 字段优先级规则：
 * 1. hiddenFields 优先级最高：不可见字段一定不显示
 * 2. maskedFields 次之：脱敏字段显示脱敏值
 * 3. editableFields 最低：可编辑字段可交互
 * 
 * 典型场景：
 * 1. 无 _perm 字段：所有字段可见只读（默认安全）
 * 2. 仅在 editableFields：可见可编辑
 * 3. 不在任何列表：可见只读
 * 4. 仅在 hiddenFields：不可见、不可编辑
 * 5. 仅在 maskedFields：脱敏可见、只读
 * 6. hiddenFields + editableFields：不可见但可提交（如密码修改）
 * 7. maskedFields + editableFields：脱敏可见、可编辑（如部分修改手机号）
 */
export interface IInstancePermission {
  /** 是否允许删除此实例（未设置时默认 false） */
  allowDelete?: boolean
  
  /** 可编辑字段列表（可写入数据，未设置或为空时所有字段只读） */
  editableFields?: string[]
  /** 不可见字段列表（不显示在 UI） */
  hiddenFields?: string[]
  /** 脱敏字段列表（显示脱敏后的值，仍然只读除非在 editableFields 中） */
  maskedFields?: string[]
}

// ==================== 模型级权限（表级） ====================

/**
 * 模型级权限：数据表/模型级别的权限控制
 * 
 * 后端裁决，前端渲染：
 * - allowCreate: 控制新增按钮显示
 * - allowImport: 控制导入按钮显示
 * - allowExport: 控制导出按钮显示
 * 
 * 注意：批量删除由实例级权限决定（统计可删除行数）
 */
export interface IModelPermission {
  /** 是否允许新增 */
  allowCreate?: boolean
  /** 是否允许导入（后端按新增/编辑权限裁决） */
  allowImport?: boolean
  /** 是否允许导出（后端按查看范围裁决） */
  allowExport?: boolean
}

// ==================== 权限字段约定 ====================

/**
 * 数据行权限字段名约定
 * 
 * 任何数据行都可以有 _perm 字段来携带实例级权限
 * 示例：
 * ```typescript
 * const user = {
 *   id: 1,
 *   name: 'Alice',
 *   _perm: { allowDelete: true, editableFields: ['name'] }
 * }
 * ```
 */
export const INSTANCE_PERMISSION_FIELD = '_perm' as const

/**
 * 数据集权限字段名约定
 * 
 * 任何数据集都可以有 _modelPerm 字段来携带模型级权限
 * 示例：
 * ```typescript
 * const dataset = {
 *   rows: [...],
 *   _modelPerm: { allowCreate: true, allowExport: false }
 * }
 * ```
 */
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

// ==================== UI 权限概念 ====================

/**
 * 字段可见性枚举
 * 
 * 控制前端字段的显示状态：
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

// ==================== 权限检查接口 ====================

/**
 * 权限检查器接口
 */
export interface IPermissionChecker {
  /** 检查是否有模型操作权限 */
  canCreate(modelPermission?: IModelPermission): boolean
  canImport(modelPermission?: IModelPermission): boolean
  canExport(modelPermission?: IModelPermission): boolean
  
  /** 检查是否有实例操作权限 */
  canDelete(row: ComponentDataRow): boolean
  canEdit(row: ComponentDataRow): boolean
  
  /** 检查字段权限 */
  isFieldVisible(field: string, row: ComponentDataRow): boolean
  isFieldEditable(field: string, row: ComponentDataRow): boolean
  getFieldVisibility(field: string, row: ComponentDataRow): FieldVisibility
  
  /** 应用脱敏规则 */
  maskFieldValue(field: string, value: unknown, row: ComponentDataRow): string
}

/**
 * 权限过滤器接口
 */
export interface IPermissionFilter {
  /** 过滤出可删除的行 */
  filterDeletableRows(rows: ComponentDataRow[]): ComponentDataRow[]
  
  /** 过滤出可编辑的行 */
  filterEditableRows(rows: ComponentDataRow[]): ComponentDataRow[]
  
  /** 过滤字段（移除隐藏字段） */
  filterFields(row: ComponentDataRow): Record<string, unknown>
  
  /** 应用字段脱敏 */
  applyFieldMasking(row: ComponentDataRow): ComponentDataRow
  
  /** 批量应用脱敏（处理整个数据集） */
  applyMaskingToDataSet(rows: ComponentDataRow[]): ComponentDataRow[]
}

// ==================== 类型工具 ====================

/**
 * 为任意类型添加实例级权限字段
 * 
 * 使用示例：
 * ```typescript
 * interface User { id: number; name: string }
 * type UserWithPerm = WithInstancePermission<User>
 * 
 * // 展开后的结果：
 * // {
 * //   id: number;
 * //   name: string;
 * //   _perm?: IInstancePermission;
 * // }
 * ```
 */
export type WithInstancePermission<T = Record<string, unknown>> = T & {
  _perm?: IInstancePermission
}

/**
 * 为任意数据集类型添加模型级权限字段
 * 
 * 使用示例：
 * ```typescript
 * interface UserList { rows: User[]; total: number }
 * type UserListWithPerm = WithModelPermission<UserList>
 * 
 * // 展开后的结果：
 * // {
 * //   rows: User[];
 * //   total: number;
 * //   _modelPerm?: IModelPermission;
 * // }
 * ```
 */
export type WithModelPermission<T = Record<string, unknown>> = T & {
  _modelPerm?: IModelPermission
}

// ==================== 组件层数据源类型 ====================

/**
 * 组件层数据源类型（带可选权限） 
 * 
 * 用于表格、列表等组件的数据源
 * 重命名为 ComponentDataSource 以避免与 spark-data 的 DataSet 类冲突
 */
export interface ComponentDataSource {
  rows: ComponentDataRow[]
  _modelPerm?: IModelPermission
  total?: number
}