/**
 * 基础权限类型定义
 * 
 * 架构说明：
 * - 这些是最基础的权限数据结构，由后端返回
 * - 位于 spark-data 层，可被 spark-app 和 spark-component 共享
 * - spark-component 中的权限类型应扩展这些基础类型
 * 
 * 设计原则：
 * - 权限字段是可选的附加信息，不强制所有数据行/集都有权限
 * - 使用约定字段名：_perm (实例级), _modelPerm (模型级)
 */

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
 * 字段优先级规则：
 * 1. hiddenFields 优先级最高：不可见字段一定不显示
 * 2. maskedFields 次之：脱敏字段显示脱敏值
 * 3. editableFields 最低：可编辑字段可交互
 * 
 * 典型场景：
 * 1. 仅在 editableFields：可见可编辑
 * 2. 不在任何列表：可见只读
 * 3. 仅在 hiddenFields：不可见、不可编辑
 * 4. 仅在 maskedFields：脱敏可见、只读
 * 5. hiddenFields + editableFields：不可见但可提交（如密码修改）
 * 6. maskedFields + editableFields：脱敏可见、可编辑（如部分修改手机号）
 */
export interface IInstancePermission {
  /** 是否允许删除此实例 */
  allowDelete?: boolean
  
  /** 可编辑字段列表（可写入数据） */
  editableFields?: string[]
  /** 不可见字段列表（不显示在 UI） */
  hiddenFields?: string[]
  /** 脱敏字段列表（显示脱敏后的值） */
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

// ==================== 类型工具 ====================

/**
 * 为任意类型添加实例级权限字段
 * 
 * 使用示例：
 * ```typescript
 * interface User { id: number; name: string }
 * type UserWithPerm = WithInstancePermission<User>
 * // 结果: User & { _perm?: IInstancePermission }
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
 * // 结果: UserList & { _modelPerm?: IModelPermission }
 * ```
 */
export type WithModelPermission<T = Record<string, unknown>> = T & {
  _modelPerm?: IModelPermission
}
