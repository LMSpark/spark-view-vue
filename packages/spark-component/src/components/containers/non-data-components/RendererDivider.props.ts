import type { SparkComponentBaseProps } from '../../shared-types'

export interface RDividerProps extends SparkComponentBaseProps<'r-divider'> {
  direction?: 'horizontal' | 'vertical'
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
  contentPosition?: 'left' | 'center' | 'right'
  content?: string
}
