import type { SparkNodeProps } from '../../shared-types'

export interface RDividerProps extends SparkNodeProps {
  /** 分割方向 */
  direction?: 'horizontal' | 'vertical'
  /** 边框样式 */
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
  /** 文本位置（横向模式） */
  contentPosition?: 'left' | 'center' | 'right'
  /** 分割线文本 */
  content?: string
}
