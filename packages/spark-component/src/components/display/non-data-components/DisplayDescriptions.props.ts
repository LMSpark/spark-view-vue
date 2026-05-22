import type { SparkNodeProps } from '../../shared-types'

export type RDescriptionsProps = SparkNodeProps & {
  /** 描述列表标题 */
    title?: string
    /** 操作区附加内容 */
    extra?: string
    /** 是否显示边框 */
    border?: boolean
    /** 每行展示的描述列数 */
    column?: number
    /** 排列方向 */
    direction?: 'horizontal' | 'vertical'
    /** 尺寸 */
    descriptionsSize?: 'large' | 'default' | 'small'}
