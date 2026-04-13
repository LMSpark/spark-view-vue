import type { SparkComponentBaseProps } from '../../shared-types'

export type SegmentedOption = string | number | { label: string; value: string | number; disabled?: boolean }

export interface RSegmentedProps extends SparkComponentBaseProps<'r-segmented'> {
  modelValue?: string | number
  options?: SegmentedOption[]
  size?: 'large' | 'default' | 'small'
  block?: boolean
}
