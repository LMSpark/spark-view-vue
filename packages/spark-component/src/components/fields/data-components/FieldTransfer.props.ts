import type { SparkFieldProps } from '../../shared-types'

export type TransferValue = Array<string | number>

export interface RTransferProps extends SparkFieldProps {
  width?: number
  modelValue?: TransferValue
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  titles?: [string, string]
  filterable?: boolean
  filterPlaceholder?: string
  targetOrder?: 'original' | 'push' | 'unshift'
}
