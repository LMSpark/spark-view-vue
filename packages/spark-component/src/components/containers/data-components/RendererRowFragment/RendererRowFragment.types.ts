import type { IDataRow } from '@spark-view/spark-data'
import type { SparkNode } from '../../../internal'

export type RowFragmentAlign = 'left' | 'center' | 'right'

/**
 * `r-row-fragment` 的公共宿主元属性。
 *
 * 这些属性先作为“行片段语义契约”沉淀下来，供不同集合宿主按需消费：
 * - table 可消费 title/label/width/minWidth/align/headerAlign
 * - list / tree / gantt 可消费 title/description/width/class
 *
 * 底层 `RendererDataScope` 本身保持透明，不直接解释这些属性。
 */
export interface RendererRowFragmentConfigProps {
  title?: string
  label?: string
  description?: string
  width?: string | number
  minWidth?: string | number
  align?: RowFragmentAlign
  headerAlign?: RowFragmentAlign
  class?: string
  fields?: SparkNode[]
}

export type RowFragmentNode = SparkNode & {
  type: 'r-row-fragment'
  props?: RendererRowFragmentConfigProps & Record<string, unknown>
  children?: SparkNode[]
}

export interface RendererRowFragmentProps {
  type?: 'r-row-fragment'
  id?: string
  title?: string
  label?: string
  description?: string
  width?: string | number
  minWidth?: string | number
  align?: RowFragmentAlign
  headerAlign?: RowFragmentAlign
  class?: string
  data?: IDataRow
  fields?: SparkNode[]
  children?: SparkNode[]
}