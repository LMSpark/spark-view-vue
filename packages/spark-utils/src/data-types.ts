/**
 * 数据类型和权限系统定义
 *
 * 提供 SPARK 架构的核心数据类型定义，包括：
 * - 基础数据类型（IDataRow）
 * - 权限系统类型（实例级、模型级权限）
 * - UI 辅助类型（字段可见性、组件级别）
 * - 权限操作接口（检查器、过滤器）
 * - 类型工具和组合类型
 *
 * 这是数据和权限类型的唯一定义源，所有包共享使用
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
 * 字段可见性枚举
 *
 * 定义字段在 UI 中的三种显示状态
 */
export enum FieldVisibility {
  Visible = 'visible',  // 显示原始值
  Masked = 'masked',    // 显示脱敏值
  Hidden = 'hidden'     // 不显示
}

/**
 * 组件级别枚举
 *
 * 定义权限控制在不同组件层级的应用范围
 */
export enum ComponentLevel {
  Model = 'model',      // 模型级（Grid、CardList）
  Instance = 'instance', // 实例级（Row、Card、Form）
  Field = 'field'       // 字段级（Input、Text）
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 权限操作接口
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 权限检查器接口
 *
 * 定义单个数据项权限检查的完整规范
 */
export interface IPermissionChecker {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 模型级权限检查
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 检查是否允许新增记录 */
  canCreate(modelPermission?: IModelPermission): boolean
  /** 检查是否允许导入数据 */
  canImport(modelPermission?: IModelPermission): boolean
  /** 检查是否允许导出数据 */
  canExport(modelPermission?: IModelPermission): boolean

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 实例级权限检查
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 检查是否允许删除指定行 */
  canDelete(row: IDataRowWithPermission): boolean
  /** 检查是否允许编辑指定行 */
  canEdit(row: IDataRowWithPermission): boolean

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 字段级权限检查
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 检查字段是否可见 */
  isFieldVisible(field: string, row: IDataRowWithPermission): boolean
  /** 检查字段是否可编辑 */
  isFieldEditable(field: string, row: IDataRowWithPermission): boolean
  /** 获取字段可见性状态 */
  getFieldVisibility(field: string, row: IDataRowWithPermission): FieldVisibility

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 字段脱敏处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 应用字段脱敏规则 */
  maskFieldValue(field: string, value: unknown, row: IDataRowWithPermission): string
}

/**
 * 权限过滤器接口
 *
 * 定义批量数据权限过滤和处理的完整规范
 */
export interface IPermissionFilter {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 数据行过滤
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 过滤出可删除的行 */
  filterDeletableRows(rows: IDataRowWithPermission[]): IDataRowWithPermission[]
  /** 过滤出可编辑的行 */
  filterEditableRows(rows: IDataRowWithPermission[]): IDataRowWithPermission[]

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 字段过滤和处理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 过滤字段（移除隐藏字段） */
  filterFields(row: IDataRowWithPermission): Record<string, unknown>
  /** 应用字段脱敏 */
  applyFieldMasking(row: IDataRowWithPermission): IDataRowWithPermission
  /** 批量应用脱敏（处理整个数据集） */
  applyMaskingToDataSet(rows: IDataRowWithPermission[]): IDataRowWithPermission[]
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 类型工具和组合类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 类型工具：添加实例权限
 *
 * 为任意类型添加实例级权限字段
 */
export type WithInstancePermission<T = Record<string, unknown>> = T & {
  _perm?: IInstancePermission
}

/**
 * 类型工具：添加模型权限
 *
 * 为任意类型添加模型级权限字段
 */
export type WithModelPermission<T = Record<string, unknown>> = T & {
  _modelPerm?: IModelPermission
}

/**
 * 带权限的数据行
 *
 * 语义别名，等价于 WithInstancePermission
 * 用于表示包含权限信息的数据行
 */
export type IDataRowWithPermission<T = Record<string, unknown>> = WithInstancePermission<T>

/**
 * 数据源接口（带权限和分页）
 *
 * 定义包含权限控制和分页信息的数据源结构
 */
export interface IDataSource<T = Record<string, unknown>> {
  /** 数据行数组（带权限） */
  rows: IDataRowWithPermission<T>[]
  /** 模型级权限 */
  _modelPerm?: IModelPermission
  /** 总记录数 */
  total?: number
  /** 当前页码 */
  page?: number
  /** 每页大小 */
  pageSize?: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. 事件系统类型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 事件回调函数类型
 *
 * 用于事件系统（EventManager）和观察者模式
 *
 * @example
 * ```ts
 * const callback: EventCallback = (data) => {
 *   console.log('Event fired:', data)
 * }
 * manager.on('dataChanged', callback)
 * ```
 */
export type EventCallback = (...args: unknown[]) => void
