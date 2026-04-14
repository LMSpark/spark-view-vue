import type { SparkOptionFieldProps } from '../../shared-types'

export type TransferValue = Array<string | number>

export interface RTransferProps extends SparkOptionFieldProps {
  value?: TransferValue
  titles?: [string, string]
  filterPlaceholder?: string
  targetOrder?: 'original' | 'push' | 'unshift'
}
