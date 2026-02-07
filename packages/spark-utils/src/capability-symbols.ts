/**
 * 能力系统 - 符号化常量
 * 
 * 使用 Symbol 代替字符串作为能力名称，提供：
 * - 类型安全
 * - 避免命名冲突
 * - IDE 自动补全
 */

// ============================================================================
// 应用层能力（App Services）
// ============================================================================

/**
 * APP 服务能力（路由、日志等）
 * 由页面层（PageRenderer）提供，组件消费
 */
export const APP_SERVICES = Symbol.for('spark:capability:app-services')

// ============================================================================
// 数据层能力（Data Layer）
// ============================================================================

/**
 * 数据源能力（提供原始数据）
 */
export const DATA_SOURCE = Symbol.for('spark:capability:data-source')

/**
 * 字段元数据能力（字段标签、类型、图标等）
 */
export const FIELD_METADATA = Symbol.for('spark:capability:field-metadata')

/**
 * 行数据能力（单行数据访问）
 */
export const ROW_DATA = Symbol.for('spark:capability:row-data')

// ============================================================================
// 交互层能力（Interaction Layer）
// ============================================================================

/**
 * 选择能力（行选择、多选等）
 */
export const SELECTION = Symbol.for('spark:capability:selection')

/**
 * 验证能力（数据验证）
 */
export const VALIDATION = Symbol.for('spark:capability:validation')

// ============================================================================
// 事件层能力（Event Layer）
// ============================================================================

/**
 * Grid 事件能力（表格级事件）
 */
export const GRID_EVENTS = Symbol.for('spark:capability:grid-events')

/**
 * 行事件能力（行级事件）
 */
export const ROW_EVENTS = Symbol.for('spark:capability:row-events')
