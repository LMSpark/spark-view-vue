/**
 * 能力系统 - 符号化常量
 * 
 * 使用 Symbol 代替字符串作为能力名称，提供：
 * - 类型安全（CapabilityKey<T> 幻影泛型自动推断实现类型）
 * - 避免命名冲突
 * - IDE 自动补全
 * 
 * 用法：
 * ```ts
 * import { APP_SERVICES } from '@spark-view/spark-utils'
 * // provide / consume 自动推断 T 为 AppServicesCapability
 * provide(APP_SERVICES, { router, logger })
 * const svc = consume(APP_SERVICES) // AppServicesCapability | null
 * ```
 */

import type {
  AppServicesCapability,
  DataSourceCapability,
  DataSetStateCapability,
  GlobalDataCapability,
  PageServiceCapability,
  ApiClientCapability,
  FieldMetadataCapability,
  RowDataCapability,
  SelectionCapability,
  ValidationCapability,
  GridEventsCapability,
  RowEventsCapability,
  GridInstanceCapability,
  ColumnManagerCapability,
  ColumnConfigCapability
} from './capability-types.js'

// ============================================================================
// CapabilityKey<T> — 幻影类型 (Phantom Type)
// ============================================================================

/**
 * 带类型信息的能力键
 *
 * 通过 branded intersection 将泛型参数 T 编码到 symbol 类型中，
 * 使得 provide/consume 函数可以根据键自动推断实现类型。
 *
 * @template T 能力实现的接口类型
 */
export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }

/**
 * 定义一个类型安全的能力键
 *
 * @template T 能力实现的接口类型
 * @param name Symbol.for() 的全局注册名
 * @returns 带类型参数的 CapabilityKey<T>
 *
 * @example
 * ```ts
 * const MY_ABILITY = defineCapability<MyAbilityInterface>('spark:capability:my-ability')
 * ```
 */
export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

// ============================================================================
// 应用层能力（App Services）
// ============================================================================

/**
 * APP 服务能力（路由、日志等）
 * 由页面层（PageRenderer）提供，组件消费
 */
export const APP_SERVICES = defineCapability<AppServicesCapability>('spark:capability:app-services')

// ============================================================================
// 数据层能力（Data Layer）
// ============================================================================

/**
 * 数据源能力（提供原始数据）
 */
export const DATA_SOURCE = defineCapability<DataSourceCapability>('spark:capability:data-source')

/**
 * DataSet 状态能力（DataSet 数据和表访问）
 */
export const DATA_SET_STATE = defineCapability<DataSetStateCapability>('spark:capability:dataset-state')

/**
 * 全局数据能力（用户信息、字典等）
 */
export const GLOBAL_DATA = defineCapability<GlobalDataCapability>('spark:capability:global-data')

/**
 * 页面服务能力（消息、导航等）
 */
export const PAGE_SERVICE = defineCapability<PageServiceCapability>('spark:capability:page-service')

/**
 * API 客户端能力
 */
export const API_CLIENT = defineCapability<ApiClientCapability>('spark:capability:api-client')

/**
 * 字段元数据能力（字段标签、类型、图标等）
 */
export const FIELD_METADATA = defineCapability<FieldMetadataCapability>('spark:capability:field-metadata')

/**
 * 行数据能力（单行数据访问）
 */
export const ROW_DATA = defineCapability<RowDataCapability>('spark:capability:row-data')

// ============================================================================
// 交互层能力（Interaction Layer）
// ============================================================================

/**
 * 选择能力（行选择、多选等）
 */
export const SELECTION = defineCapability<SelectionCapability>('spark:capability:selection')

/**
 * 验证能力（数据验证）
 */
export const VALIDATION = defineCapability<ValidationCapability>('spark:capability:validation')

// ============================================================================
// 事件层能力（Event Layer）
// ============================================================================

/**
 * Grid 事件能力（表格级事件）
 */
export const GRID_EVENTS = defineCapability<GridEventsCapability>('spark:capability:grid-events')

/**
 * 行事件能力（行级事件）
 */
export const ROW_EVENTS = defineCapability<RowEventsCapability>('spark:capability:row-events')

// ============================================================================
// EJ2 Grid 专用能力
// ============================================================================

/**
 * Grid 实例能力（EJ2 Grid 实例引用）
 */
export const GRID_INSTANCE = defineCapability<GridInstanceCapability>('spark:capability:grid-instance')

/**
 * 列管理器能力（列的增删查改）
 */
export const COLUMN_MANAGER = defineCapability<ColumnManagerCapability>('spark:capability:column-manager')

/**
 * 列配置能力（单列的子列管理）
 */
export const COLUMN_CONFIG = defineCapability<ColumnConfigCapability>('spark:capability:column-config')
