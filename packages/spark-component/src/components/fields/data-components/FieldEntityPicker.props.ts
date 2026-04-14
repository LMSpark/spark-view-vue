import type { PageSelectableValue } from '@spark-view/spark-utils'
import type {
  SparkOptionFieldProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
} from '../../shared-types'

export type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

export interface REntityPickerProps
  extends SparkOptionFieldProps, SparkPrimaryActionTextProps, SparkReadonlyActionTextProps {
  value?: EntityPickerValue
  searchable?: boolean
  entityName?: string
}
