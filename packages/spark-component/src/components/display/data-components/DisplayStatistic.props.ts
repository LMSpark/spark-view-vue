import type { SparkComponentBaseProps } from '../../shared-types'

export interface RStatisticProps extends SparkComponentBaseProps<'r-statistic'> {
title?: string
  value?: number | string
  dataKey?: string
  field?: string
  precision?: number
  decimalSeparator?: string
  groupSeparator?: string
  prefix?: string
  suffix?: string
  valueStyle?: object | string
}
