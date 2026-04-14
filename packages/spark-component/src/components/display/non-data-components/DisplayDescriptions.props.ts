import type { SparkNodeProps } from '../../shared-types'

export interface RDescriptionsProps extends SparkNodeProps {
title?: string
  extra?: string
  border?: boolean
  column?: number
  direction?: 'horizontal' | 'vertical'
  descriptionsSize?: 'large' | 'default' | 'small'
}
