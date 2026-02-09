// EJ2-specific component configuration types
// Unified location for all Spark-EJ2 type definitions

/**
 * EJ2 Grid 组件配置
 *
 * 纯配置类型 — 仅描述 JSON 可序列化的静态配置，
 * 不继承 ComponentContext 的运行时字段（id, state, providers, consumers 等）。
 * 运行时上下文由 useSparkComponent 在挂载时自动创建。
 */
export interface SparkEJ2GridConfig {
  type: 'spark-ej2-grid'
  dataSource?: unknown[]
  allowSorting?: boolean
  allowFiltering?: boolean
  allowGrouping?: boolean
  allowPaging?: boolean
  pageSettings?: {
    pageSize?: number
    currentPage?: number
    pageSizes?: number[]
    [key: string]: unknown
  }
  height?: string | number
  width?: string | number
  children?: SparkEJ2ColumnConfig[]
  [key: string]: unknown
}

/**
 * EJ2 Column 组件配置
 *
 * 纯配置类型，同 SparkEJ2GridConfig 的设计原则。
 */
export interface SparkEJ2ColumnConfig {
  type: 'spark-ej2-column'
  field?: string
  headerText?: string
  width?: string | number
  textAlign?: 'Left' | 'Center' | 'Right' | 'Justify'
  format?: string
  template?: unknown
  visible?: boolean
  allowSorting?: boolean
  allowFiltering?: boolean
  allowGrouping?: boolean
  children?: SparkEJ2ColumnConfig[]
  [key: string]: unknown
}
