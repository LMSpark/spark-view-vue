import type { SparkNodeProps } from '../../shared-types'

export interface RResultProps extends SparkNodeProps {
icon?: 'success' | 'warning' | 'info' | 'error'
  title?: string
  subTitle?: string
}
