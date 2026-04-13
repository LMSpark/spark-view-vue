import type { SparkComponentBaseProps } from '../../shared-types'

export type TagType = 'success' | 'info' | 'warning' | 'danger'

export interface RTagProps extends SparkComponentBaseProps<'r-tag'> {
content?: string
  value?: string
  field?: string
  tagType?: '' | TagType
  dynamicType?: Record<string, '' | TagType>
  closable?: boolean
  disableTransitions?: boolean
  hit?: boolean
  round?: boolean
  color?: string
  size?: 'large' | 'default' | 'small'
  effect?: 'dark' | 'light' | 'plain'
}
