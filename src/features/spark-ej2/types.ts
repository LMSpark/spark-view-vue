// EJ2-specific component configuration types
// Unified location for all Spark-EJ2 type definitions

/**
 * EJ2 Grid 组件配置
 *
 * 纯配置类型 — 仅描述 JSON 可序列化的静态配置，
 * 不继承 ComponentContext 的运行时字段（id, state, providers, consumers 等）。
 * 运行时上下文由 useSparkComponent 在挂载时自动创建。
 * 
 * @since 2.1.0 - 新增按需引入相关配置项
 */
export interface SparkEJ2GridConfig {
  type: 'spark-ej2-grid'
  dataSource?: unknown[]
  
  // ── 基础功能配置 ──
  allowSorting?: boolean
  allowFiltering?: boolean
  allowGrouping?: boolean
  allowPaging?: boolean
  
  // ── 编辑功能配置 ──
  editSettings?: {
    allowEditing?: boolean
    allowAdding?: boolean
    allowDeleting?: boolean
    mode?: 'Normal' | 'Dialog' | 'Batch'
    [key: string]: unknown
  }
  
  // ── 工具栏配置 ──
  toolbar?: string[] | unknown[]
  
  // ── 导出功能配置 ──
  allowExcelExport?: boolean
  allowPdfExport?: boolean
  
  // ── 列选择器配置 ──
  showColumnChooser?: boolean
  
  // ── 右键菜单配置 ──
  contextMenuItems?: string[] | unknown[]
  
  // ── 列操作配置 ──
  allowResizing?: boolean
  allowReordering?: boolean
  
  // ── 分页配置 ──
  pageSettings?: {
    pageSize?: number
    currentPage?: number
    pageSizes?: number[]
    [key: string]: unknown
  }
  
  // ── 外观配置 ──
  height?: string | number
  width?: string | number
  
  // ── 子组件配置 ──
  children?: SparkEJ2ColumnConfig[]
  
  // ── 其他 EJ2 原生配置 ──
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
