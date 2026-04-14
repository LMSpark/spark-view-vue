import type { PageSelectableValue } from '@spark-view/spark-utils'
import type { SparkFieldProps } from '../../shared-types'

export type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

export interface REntityPickerProps extends SparkFieldProps {
  width?: number
  modelValue?: EntityPickerValue
  options?: unknown[]
  optionKey?: string
  optionLabelField?: string
  optionValueField?: string
  buttonText?: string
  readonlyButtonText?: string
  clearable?: boolean
  multiple?: boolean
  searchable?: boolean
  separator?: string
  valueMode?: 'auto' | 'array' | 'comma-string'
  entityName?: string
}
