/**
 * 基础权限类型定义
 * 
 * 架构说明：
 * - 这些是最基础的权限数据结构，由后端返回
 * - 位于 spark-data 层，可被 spark-app 和 spark-component 共享
 * - spark-component 中的权限类型应扩展这些基础类型
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

// ==================== 权限数据行 ====================

/**
 * 带权限的数据行（后端返回的标准格式）
 */
export interface IPermissionDataRow {
  /** 数据字段 */
  [key: string]: unknown
  
  /** 实例级权限（约定字段名 _perm） */
  _perm?: IInstancePermission
}

// ==================== 权限数据集 ====================

/**
 * 带权限的数据集（后端返回的标准格式）
 */
export interface IPermissionDataSet<T = IPermissionDataRow> {
  /** 数据行列表 */
  rows: T[]
  
  /** 模型级权限（约定字段名 _modelPerm） */
  _modelPerm?: IModelPermission
  
  /** 总记录数 */
  total?: number
  
  /** 其他元数据 */
  [key: string]: unknown
}
