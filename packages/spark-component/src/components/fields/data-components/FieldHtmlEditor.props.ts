import type { SparkFieldProps } from '../../shared-types'

export interface RHtmlEditorProps extends SparkFieldProps<'r-html-editor'> {
  width?: number
  modelValue?: string
  rows?: number
}
