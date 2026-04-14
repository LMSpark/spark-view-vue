import type { SparkNodeProps } from '../../shared-types'

export interface RSpaceProps extends SparkNodeProps {
  /** 主轴方向 */
  direction?: 'horizontal' | 'vertical'
  /** 间距 */
  size?: number | string
  /** 是否自动换行 */
  wrap?: boolean
  /** 是否填充父容器 */
  fill?: boolean
  /** 交叉轴对齐方式 */
  alignment?: 'stretch' | 'center' | 'flex-start' | 'flex-end' | 'baseline'
}
