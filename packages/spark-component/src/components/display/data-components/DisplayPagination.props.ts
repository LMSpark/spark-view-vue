import type { SparkNodeProps } from '../../shared-types'

export interface RPaginationProps extends SparkNodeProps {
  /** 总条数 */
total?: number
  /** 每页条数 */
  pageSize?: number
  /** 当前页 */
  currentPage?: number
  /** 每页条数选项 */
  pageSizes?: number[]
  /** 页码按钮数量 */
  pagerCount?: number
  /** 布局模板 */
  layout?: string
  /** 是否显示背景 */
  background?: boolean
  /** 是否小尺寸 */
  small?: boolean
  /** 单页时是否隐藏 */
  hideOnSinglePage?: boolean
}
