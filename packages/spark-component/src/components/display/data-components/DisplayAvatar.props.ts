import type { SparkComponentBaseProps } from '../../shared-types'

export interface RAvatarProps extends SparkComponentBaseProps<'r-avatar'> {
avatarSize?: number | 'large' | 'default' | 'small'
  shape?: 'circle' | 'square'
  src?: string
  value?: string
  field?: string
  srcSet?: string
  alt?: string
  fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
  text?: string
  icon?: string
}
