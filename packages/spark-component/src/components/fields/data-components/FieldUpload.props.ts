import type { SparkFieldProps } from '../../shared-types'

export interface RUploadProps extends SparkFieldProps<'r-upload'> {
  width?: number
  modelValue?: string
  action?: string
  accept?: string
  buttonText?: string
  autoUpload?: boolean
  showFileList?: boolean
  limit?: number
  listType?: 'text' | 'picture' | 'picture-card'
  separator?: string
  readonlyButtonText?: string
}
