// EJ2-specific component configuration types
// These should be defined in the application layer, not in core

import type { ComponentConfig } from '@spark-view/spark-component'

export interface SparkEJ2GridConfig extends ComponentConfig {
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

export interface SparkEJ2ColumnConfig extends ComponentConfig {
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