import type { SparkNodeProps } from '../../shared-types'

export interface RResultProps extends SparkNodeProps {
  /** 结果图标类型 */
    icon?: 'success' | 'warning' | 'info' | 'error'
    /** 结果标题 */
    title?: string
    /** 结果副标题 */
    subTitle?: string
}
