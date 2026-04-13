import type { SparkChildrenProps } from '../../shared-types'

export interface RDescriptionsProps extends SparkChildrenProps<'r-descriptions'> {
title?: string
  extra?: string
  border?: boolean
  column?: number
  direction?: 'horizontal' | 'vertical'
  descriptionsSize?: 'large' | 'default' | 'small'
}
