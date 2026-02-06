// EJ2-specific component configuration types
// Unified location for all Spark-EJ2 type definitions

import type { ComponentContext } from '@spark-view/spark-component'

export interface SparkEJ2GridConfig extends ComponentContext {
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

export interface SparkEJ2ColumnConfig extends ComponentContext {
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
