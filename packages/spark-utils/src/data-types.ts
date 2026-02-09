/**
 * 基础数据类型定义
 *
 * 数据和权限类型的唯一定义源，所有包共享使用
 *
 * @packageDocumentation
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 基础数据类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 数据行：键值对结构（纯数据，无权限）
 *
 * 支持泛型，可指定具体的数据类型
 */
export type IDataRow<T extends Record<string, unknown> = Record<string, unknown>> = T


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 权限类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 实例级权限（行级权限）
 *
 * 控制单条数据的 CRUD 操作和字段可见性
 *
 * @example
 * ```ts
 * const user = {
 *   id: 1,
 *   name: 'Alice',
 *   salary: 50000,
 *   _perm: {
 *     allowDelete: true,
 *     editableFields: ['name'],
 *     maskedFields: ['salary']
 *   }
 * }
 * ```
 *
 * 字段优先级（从高到低）：
 * 1. hiddenFields - 完全不显示
 * 2. maskedFields - 显示脱敏值
 * 3. editableFields - 可编辑
 * 4. 默认 - 可见只读
 */
export interface IInstancePermission {
  /** 允许删除（默认 false） */
  allowDelete?: boolean
  /** 可编辑字段（为空时全部只读） */
  editableFields?: string[]
  /** 不可见字段（UI 不渲染） */
  hiddenFields?: string[]
  /** 脱敏字段（显示 *** 等）*/
  maskedFields?: string[]
}

/**
 * 模型级权限（表级权限）
 *
 * 控制数据表的整体操作权限
 *
 * @example
 * ```ts
 * const ordersDataSource: IDataSource = {
 *   rows: [
 *     {
 *       orderId: 1,
 *       amount: 100,
 *       _perm: { allowDelete: true }
 *     },
 *     {
 *       orderId: 2,
 *       amount: 200,
 *       _perm: { allowDelete: false }
 *     }
 *   ],
 *   _modelPerm: {
 *     allowCreate: true,    // 允许新增订单
 *     allowImport: false,   // 禁止批量导入
 *     allowExport: true     // 允许导出数据
 *   },
 *   total: 100,
 *   page: 1,
 *   pageSize: 20
 * }
 * ```
 */
export interface IModelPermission {
  /** 允许新增记录 */
  allowCreate?: boolean
  /** 允许导入数据 */
  allowImport?: boolean
  /** 允许导出数据 */
  allowExport?: boolean
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 权限字段约定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 实例权限字段名 */
export const INSTANCE_PERMISSION_FIELD = '_perm' as const

/** 模型权限字段名 */
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. UI 辅助类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 字段可见性
 *
 * Visible - 显示原始值
 * Masked - 显示脱敏值
 * Hidden - 不显示
 */
export enum FieldVisibility {
  Visible = 'visible',
  Masked = 'masked',
  Hidden = 'hidden'
}

/**
 * 组件级别
 *
 * Model - 模型级（Grid、CardList）
 * Instance - 实例级（Row、Card、Form）
 * Field - 字段级（Input、Text）
 */
export enum ComponentLevel {
  Model = 'model',
  Instance = 'instance',
  Field = 'field'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 权限操作接口
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 权限检查和过滤服务
 *
 * 包含两个职责分离的接口：
 * - IPermissionChecker: 单个数据的权限检查
 * - IPermissionFilter: 批量数据的权限过滤
 */

/** 权限检查器：检查单个数据项的权限 */
export interface IPermissionChecker {
  // 模型级权限检查
  canCreate(modelPermission?: IModelPermission): boolean
  canImport(modelPermission?: IModelPermission): boolean
  canExport(modelPermission?: IModelPermission): boolean

  // 实例级权限检查
  canDelete(row: IDataRowWithPermission): boolean
  canEdit(row: IDataRowWithPermission): boolean

  // 字段级权限检查
  isFieldVisible(field: string, row: IDataRowWithPermission): boolean
  isFieldEditable(field: string, row: IDataRowWithPermission): boolean
  getFieldVisibility(field: string, row: IDataRowWithPermission): FieldVisibility

  // 脱敏处理
  maskFieldValue(field: string, value: unknown, row: IDataRowWithPermission): string
}

/** 权限过滤器：批量过滤和处理数据 */
export interface IPermissionFilter {
  filterDeletableRows(rows: IDataRowWithPermission[]): IDataRowWithPermission[]
  filterEditableRows(rows: IDataRowWithPermission[]): IDataRowWithPermission[]
  filterFields(row: IDataRowWithPermission): Record<string, unknown>
  applyFieldMasking(row: IDataRowWithPermission): IDataRowWithPermission
  applyMaskingToDataSet(rows: IDataRowWithPermission[]): IDataRowWithPermission[]
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 类型工具和组合类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 添加实例权限的类型工具 */
export type WithInstancePermission<T = Record<string, unknown>> = T & {
  _perm?: IInstancePermission
}

/** 添加模型权限的类型工具 */
export type WithModelPermission<T = Record<string, unknown>> = T & {
  _modelPerm?: IModelPermission
}

/**
 * 带权限的数据行
 * 等价于 WithInstancePermission，保留为语义别名
 */
export type IDataRowWithPermission<T = Record<string, unknown>> = WithInstancePermission<T>

/** 数据源（带权限和分页，支持泛型） */
export interface IDataSource<T = Record<string, unknown>> {
  rows: IDataRowWithPermission<T>[]
  _modelPerm?: IModelPermission
  /** 总记录数 */
  total?: number
  /** 当前页码 */
  page?: number
  /** 每页大小 */
  pageSize?: number
}
