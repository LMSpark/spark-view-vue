import type { SparkFileFieldProps, SparkFileUploadActionProps } from '../../shared-types'

export interface RUploadProps extends SparkFileFieldProps, SparkFileUploadActionProps {
  autoUpload?: boolean
  showFileList?: boolean
  limit?: number
  listType?: 'text' | 'picture' | 'picture-card'
}
